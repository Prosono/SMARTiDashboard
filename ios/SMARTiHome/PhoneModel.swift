import SwiftUI
import CoreLocation
import UserNotifications

@MainActor final class PhoneModel: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published var notificationsReady = false
    @Published var notificationStatus = "Varsler er ikke aktivert."
    @Published var paired = false
    @Published var sharing = false
    @Published var busy = false
    @Published var status = "Logg inn på hjemmet ditt, og velg Koble til denne telefonen."
    @Published var error: String?
    @Published var permission: CLAuthorizationStatus = .notDetermined
    private let location = CLLocationManager()
    private var pushFailureObserver: NSObjectProtocol?
    private var logoutObserver: NSObjectProtocol?
    private var wantsNotifications = false
    private var sending = false
    private var lastSent: Date = .distantPast

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyHundredMeters
        location.distanceFilter = 100
        permission = location.authorizationStatus
        pushFailureObserver = NotificationCenter.default.addObserver(forName: Notification.Name("SMARTiPushRegistrationFailed"), object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                self?.notificationStatus = "iPhone kunne ikke registrere varsler hos Apple. Prøv igjen om litt."
            }
        }
        PushAppDelegate.sharedTokenChanged = { [weak self] token in
            Task { await self?.registerPushToken(token) }
        }
        logoutObserver = NotificationCenter.default.addObserver(forName: Notification.Name("SMARTiSignedOut"), object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.stopLocation(); self.sharing = false; self.paired = false
                self.wantsNotifications = false; self.notificationsReady = false
                self.status = "Logg inn og koble telefonen til kontoen din igjen."
            }
        }
        Task { await refresh() }
    }
    func refresh() async {
        paired = await MobileClient.shared.paired()
        guard paired, let scope = CredentialStore.load()?.scope else { return }
        do {
            let data = try await MobileClient.shared.send("companion", method: "GET")
            let info = try JSONDecoder().decode(CompanionStatus.self, from: data)
            guard CredentialStore.load()?.scope == scope else { return }
            notificationsReady = info.notifications_ready
            notificationStatus = info.notifications_ready ? "Varsler er aktivert for dette hjemmet." : "Varsler er ikke aktivert."
            wantsNotifications = info.notifications_ready
            if info.notifications_ready {
                let settings = await UNUserNotificationCenter.current().notificationSettings()
                if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                    UIApplication.shared.registerForRemoteNotifications()
                } else if settings.authorizationStatus == .denied {
                    await disableNotifications()
                }
            }
            sharing = info.location_enabled
            status = info.registered ? "Telefonen er registrert i hjemmet." : "Telefonen er koblet til. Fullfør registreringen."
            if sharing { startLocation() }
        } catch { self.error = error.localizedDescription }
    }
    func register() async throws {
        try await MobileClient.shared.send("companion", body: ["name": UIDevice.current.name,
            "model": UIDevice.current.model, "os_version": UIDevice.current.systemVersion,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1"])
        await refresh()
    }
    func enableNotifications() async {
        busy = true; defer { busy = false }
        do {
            try await register()
            guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) else {
                notificationStatus = "Tillat varsler i iPhone-innstillingene for å fortsette."
                return
            }
            wantsNotifications = true
            notificationStatus = "Registrerer varsler …"
            UIApplication.shared.registerForRemoteNotifications()
        } catch { self.error = error.localizedDescription }
    }
    func registerPushToken(_ token: String) async {
        guard wantsNotifications, await MobileClient.shared.paired() else { return }
        #if DEBUG
        let environment = "development"
        #else
        let environment = "production"
        #endif
        do {
            try await MobileClient.shared.send("notifications", method: "PUT", body: ["token": token, "environment": environment])
            notificationsReady = true
            notificationStatus = "Varsler er aktivert for dette hjemmet."
        } catch {
            notificationsReady = false
            notificationStatus = "Kunne ikke aktivere varsler. Kontroller at huben er oppdatert, og prøv igjen."
        }
    }
    func disableNotifications() async {
        do {
            try await MobileClient.shared.send("notifications", method: "DELETE")
            wantsNotifications = false
            notificationsReady = false
            notificationStatus = "Varsler er slått av for dette hjemmet."
            UIApplication.shared.unregisterForRemoteNotifications()
        } catch { self.error = error.localizedDescription }
    }
    func testNotification() async {
        busy = true; defer { busy = false }
        do {
            try await MobileClient.shared.send("notifications/test")
            notificationStatus = "Testvarselet er sendt til Apple. Det skal dukke opp på telefonen."
        } catch { self.error = error.localizedDescription }
    }
    func setSharing(_ enabled: Bool) async {
        busy = true; defer { busy = false }
        if !enabled { stopLocation() }
        do {
            if enabled { try await register() }
            try await MobileClient.shared.send("location-consent", method: "PUT", body: ["enabled": enabled])
            sharing = enabled
            if enabled {
                if permission == .notDetermined { location.requestWhenInUseAuthorization() }
                else { startLocation() }
            }
        } catch { self.error = error.localizedDescription }
    }
    func enableBackground() { location.requestAlwaysAuthorization() }
    func startLocation() {
        guard sharing, permission == .authorizedAlways || permission == .authorizedWhenInUse else { return }
        location.requestLocation()
        if permission == .authorizedAlways && CLLocationManager.significantLocationChangeMonitoringAvailable() {
            location.startMonitoringSignificantLocationChanges()
        }
    }
    private func stopLocation() {
        location.stopMonitoringSignificantLocationChanges(); location.stopUpdatingLocation()
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        permission = manager.authorizationStatus
        if permission == .denied || permission == .restricted { stopLocation() }
        else { startLocation() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code != .locationUnknown { self.error = "Posisjonen er ikke tilgjengelig akkurat nå." }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard sharing, !sending, let point = locations.last, point.horizontalAccuracy >= 0,
              point.horizontalAccuracy <= 1000, abs(point.timestamp.timeIntervalSinceNow) < 600,
              point.timestamp.timeIntervalSince(lastSent) > 30 else { return }
        sending = true
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "SMARTi location")
        Task {
            defer {
                sending = false
                if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) }
            }
            do {
                try await MobileClient.shared.send("location", body: ["latitude": point.coordinate.latitude,
                    "longitude": point.coordinate.longitude, "accuracy": point.horizontalAccuracy,
                    "timestamp": point.timestamp.timeIntervalSince1970])
                lastSent = point.timestamp
                status = "Posisjon sendt \(point.timestamp.formatted(date: .omitted, time: .shortened))."
            } catch { self.error = error.localizedDescription }
        }
    }
    func disconnect() async {
        stopLocation(); busy = true; defer { busy = false }
        do { try await MobileClient.shared.disconnect(); wantsNotifications = false; notificationsReady = false; UIApplication.shared.unregisterForRemoteNotifications(); sharing = false; paired = false; status = "Telefonen er koblet fra." }
        catch { self.error = error.localizedDescription }
    }
}


@MainActor final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var sharedTokenChanged: ((String) -> Void)?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Self.sharedTokenChanged?(deviceToken.map { String(format: "%02x", $0) }.joined())
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Never include token material or system diagnostics in the user-facing message.
        NotificationCenter.default.post(name: Notification.Name("SMARTiPushRegistrationFailed"), object: nil)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let id = (info["smarti_notification_id"] as? String).flatMap { UUID(uuidString: $0)?.uuidString.lowercased() }
        let home = info["smarti_home_id"] as? String
        Task { @MainActor in NotificationInbox.shared.open(id: id, home: home) }
        completionHandler()
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { @MainActor in
            if NotificationInbox.shared.presented { await NotificationInbox.shared.load() }
        }
        completionHandler([.banner, .sound, .list])
    }
}

struct InboxItem: Decodable, Identifiable {
    let id: String
    let title: String
    let message: String
    let created: Double
    var read_at: Double?
    let delivery: String
}

@MainActor final class NotificationInbox: ObservableObject {
    static let shared = NotificationInbox()
    @Published var presented = false
    @Published var items: [InboxItem] = []
    @Published var selected: InboxItem?
    @Published var error: String?
    @Published var loading = false
    @Published var hasMore = false
    private var pendingID: String?
    private var expectedHome: String?
    private var scope: String?
    private var generation = UUID()
    var authorize: (() async throws -> Void)?

    func clear() {
        generation = UUID(); presented = false; items = []; selected = nil
        error = nil; pendingID = nil; expectedHome = nil; scope = nil
        hasMore = false; loading = false
    }
    private func checkAccess() async throws {
        guard let authorize else { throw PhoneError.message("Åpne hjemmet og logg inn først.") }
        try await authorize()
    }

    func open(id: String? = nil, home: String? = nil) {
        clear()
        pendingID = id; expectedHome = home
        items = []; selected = nil; error = nil
        presented = true
    }
    func load(more: Bool = false) async {
        guard !loading else { return }
        let epoch = generation
        loading = true; defer { if generation == epoch { loading = false } }
        error = nil
        guard let credentials = CredentialStore.load() else {
            items = []; selected = nil
            error = "Koble denne telefonen til hjemmet for å se varsler."
            return
        }
        if let expectedHome, !MobileClient.matchesNotificationHome(expectedHome, origin: credentials.origin) {
            items = []; selected = nil
            error = "Dette varselet tilhører et annet hjem. Velg hjemmet og koble telefonen til det for å se historikken."
            return
        }
        if scope != credentials.scope { items = []; selected = nil; scope = credentials.scope }
        do {
            try await checkAccess()
            guard generation == epoch else { return }
            let path = more && !items.isEmpty ? "inbox?before=\(items.last!.created)" : "inbox"
            let data = try await MobileClient.shared.send(path, method: "GET")
            let rows = try JSONDecoder().decode([InboxItem].self, from: data)
            try await checkAccess()
            guard generation == epoch, CredentialStore.load()?.scope == credentials.scope else { return }
            if more { items += rows } else { items = rows }
            hasMore = rows.count == 100
            if let id = pendingID {
                pendingID = nil
                if let item = items.first(where: { $0.id == id }) { await select(item) }
                else {
                    let data = try await MobileClient.shared.send("inbox/" + id, method: "GET")
                    guard generation == epoch, CredentialStore.load()?.scope == credentials.scope else { return }
                    await select(try JSONDecoder().decode(InboxItem.self, from: data))
                }
            }
        } catch { if generation == epoch { items = []; selected = nil; hasMore = false; self.error = error.localizedDescription } }
    }
    func select(_ item: InboxItem) async {
        let epoch = generation
        let currentScope = scope
        do {
            try await checkAccess()
            guard generation == epoch, let currentScope, currentScope == CredentialStore.load()?.scope else { return }
            _ = try await MobileClient.shared.send("inbox/\(item.id)/read", method: "PUT")
            try await checkAccess()
            guard generation == epoch, currentScope == CredentialStore.load()?.scope else { return }
            selected = item
            if let index = items.firstIndex(where: { $0.id == item.id }) { items[index].read_at = Date().timeIntervalSince1970 }
            selected?.read_at = Date().timeIntervalSince1970
        } catch { if generation == epoch { items = []; selected = nil; self.error = error.localizedDescription } }
    }

}

struct NotificationInboxView: View {
    @ObservedObject var inbox: NotificationInbox
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if let error = inbox.error {
                    Section { Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
                        Button("Prøv igjen") { Task { await inbox.load() } }
                    }
                }
                if let item = inbox.selected {
                    Section {
                        Button { inbox.selected = nil } label: { Label("Alle varsler", systemImage: "chevron.left") }
                        Text(item.title).font(.title2.bold())
                        Text(Date(timeIntervalSince1970: item.created), style: .date).foregroundStyle(.secondary)
                        Text(item.message).font(.body).textSelection(.enabled)
                        if item.delivery == "failed" { Label("Pushvarselet kunne ikke sendes. Meldingen er lagret her.", systemImage: "exclamationmark.circle").foregroundStyle(.secondary) }
                    }
                } else if inbox.items.isEmpty && !inbox.loading && inbox.error == nil {
                    Section {
                        Label("Ingen varsler ennå", systemImage: "bell.badge").font(.headline)
                        Text("Varsler til SMARTi-appen samles her, slik at du kan lese dem igjen senere.").foregroundStyle(.secondary)
                    }
                } else {
                    Section("Varslene dine") {
                        ForEach(inbox.items) { item in
                            Button { Task { await inbox.select(item) } } label: {
                                HStack(alignment: .top, spacing: 14) {
                                    Image(systemName: item.read_at == nil ? "bell.badge.fill" : "bell")
                                        .foregroundStyle(item.read_at == nil ? Color.orange : Color.secondary)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(item.title).font(.headline).foregroundStyle(.primary)
                                        Text(item.message).lineLimit(2).foregroundStyle(.secondary)
                                        Text(Date(timeIntervalSince1970: item.created), style: .relative).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                    if item.read_at == nil { Circle().fill(.orange).frame(width: 8, height: 8).accessibilityLabel("Ulest") }
                                }.padding(.vertical, 6)
                            }
                        }
                        if inbox.hasMore { Button("Vis eldre varsler") { Task { await inbox.load(more: true) } } }
                    }
                }
                if inbox.loading { ProgressView("Henter varsler …") }
            }
            .navigationTitle("Varslingssenter")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Lukk") { dismiss() } } }
            .refreshable { await inbox.load() }
            .task { await inbox.load() }
        }
    }
}
