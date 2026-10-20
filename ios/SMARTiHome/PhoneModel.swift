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
        Task { await refresh() }
    }
    func refresh() async {
        paired = await MobileClient.shared.paired()
        guard paired else { return }
        do {
            let data = try await MobileClient.shared.send("companion", method: "GET")
            let info = try JSONDecoder().decode(CompanionStatus.self, from: data)
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
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
