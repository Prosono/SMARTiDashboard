import SwiftUI
import WebKit
import VisionKit
import AVFoundation

@main struct SMARTiHomeApp: App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
    @StateObject private var phone = PhoneModel()
    @StateObject private var home = HomeBrowser()
    var body: some Scene {
        WindowGroup {
            GeometryReader { geometry in
                BrowserView(browser: home)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .overlay {
                        if home.failure != nil {
                            HomeUnavailableView(retry: { home.retry() }, chooseHome: { home.openPortal() })
                                .background(Color(red: 0.96, green: 0.98, blue: 0.99).ignoresSafeArea())
                        }
                    }
            }
            .ignoresSafeArea(.container, edges: home.failure == nil ? .all : [])
            .sheet(isPresented: $home.showPhoneSettings) {
                PhoneSettingsView(phone: phone, home: home)
            }
            .sheet(isPresented: $home.showScanner) { HubScanner(home: home) }
            .sheet(isPresented: $home.showDiscovery, onDismiss: { home.discoveryDismissed() }) { HubDiscoveryView(home: home) }
            .onOpenURL { url in _ = home.openActivation(url.absoluteString) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL { _ = home.openActivation(url.absoluteString) }
            }
            .preferredColorScheme(home.failure == nil ? nil : .light)
            .tint(Color(red: 0.87, green: 0.32, blue: 0.03))
            .alert("SMARTi", isPresented: Binding(get: { phone.error != nil }, set: { if !$0 { phone.error = nil } })) {
                Button("OK") { phone.error = nil }
            } message: { Text(phone.error ?? "") }
        }
    }
}


/// Native and bundled: this screen must remain usable without a network connection.
struct HomeUnavailableView: View {
    var retry: () -> Void
    var chooseHome: () -> Void
    private let ink = Color(red: 0.04, green: 0.10, blue: 0.23)
    private let orange = Color(red: 1, green: 0.34, blue: 0)

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        Image("SMARTiMark").resizable().scaledToFit().frame(width: 46, height: 46)
                        Text("SMARTi").font(.system(size: 28, weight: .semibold))
                    }
                    .accessibilityElement(children: .ignore).accessibilityLabel("SMARTi")
                    .padding(.top, 24)
                    Spacer(minLength: 28)
                    HomeUnavailableIllustration()
                        .frame(height: min(260, geometry.size.height * 0.32))
                        .accessibilityHidden(true)
                    VStack(spacing: 18) {
                        Text("Kunne ikke laste\nhjemmet")
                            .font(.system(.largeTitle, design: .default, weight: .bold))
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        Text("Prøv igjen om et øyeblikk,\neller velg et annet hjem.")
                            .font(.title3).foregroundStyle(Color(red: 0.34, green: 0.39, blue: 0.46))
                            .fixedSize(horizontal: false, vertical: true)
                    }.multilineTextAlignment(.center).padding(.top, 24)
                    VStack(spacing: 12) {
                        Button(action: retry) {
                            Label("Prøv igjen", systemImage: "arrow.clockwise")
                                .frame(maxWidth: .infinity, minHeight: 58)
                                .foregroundStyle(.white).background(orange, in: RoundedRectangle(cornerRadius: 18))
                        }
                        Button(action: chooseHome) {
                            Label("Velg et annet hjem", systemImage: "house")
                                .frame(maxWidth: .infinity, minHeight: 58)
                                .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 18))
                                .overlay(RoundedRectangle(cornerRadius: 18).stroke(ink.opacity(0.18), lineWidth: 1))
                        }
                    }.font(.title3.weight(.semibold)).buttonStyle(.plain).padding(.top, 34)
                    Spacer(minLength: 36)
                }
                .padding(.horizontal, 28)
                .frame(maxWidth: 460)
                .frame(minHeight: geometry.size.height)
                .frame(maxWidth: .infinity)
            }.foregroundStyle(ink)
        }
    }
}

struct HomeUnavailableIllustration: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 320, size.height / 270)
            context.translateBy(x: (size.width - 320 * scale) / 2, y: (size.height - 270 * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            func polygon(_ points: [CGPoint], _ color: Color) {
                var path = Path(); path.addLines(points); path.closeSubpath()
                context.fill(path, with: .color(color))
            }
            func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: Color, radius: CGFloat = 0) {
                context.fill(Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: radius), with: .color(color))
            }
            context.fill(Path(ellipseIn: CGRect(x: 18, y: 0, width: 280, height: 260)), with: .color(Color(red: 0.92, green: 0.96, blue: 0.99)))
            let cloud = Color(red: 0.88, green: 0.93, blue: 0.97)
            rect(48, 65, 68, 20, cloud, radius: 10)
            rect(65, 52, 34, 31, cloud, radius: 16)
            rect(245, 133, 48, 15, cloud, radius: 8)
            rect(257, 121, 25, 25, cloud, radius: 12)
            context.fill(Path(ellipseIn: CGRect(x: 28, y: 150, width: 46, height: 97)), with: .color(Color(red: 0.66, green: 0.77, blue: 0.86)))
            rect(50, 183, 2, 78, Color(red: 0.45, green: 0.58, blue: 0.69), radius: 1)
            polygon([CGPoint(x: 85,y: 177),CGPoint(x: 140,y: 120),CGPoint(x: 195,y: 177),CGPoint(x: 195,y: 260),CGPoint(x: 85,y: 260)], Color(red: 0.99,green: 0.995,blue: 1))
            rect(195, 176, 68, 84, Color(red: 0.83,green: 0.89,blue: 0.93))
            polygon([CGPoint(x: 140,y: 120),CGPoint(x: 211,y: 120),CGPoint(x: 263,y: 177),CGPoint(x: 195,y: 177)], Color(red: 0.35,green: 0.43,blue: 0.52))
            var roof = Path(); roof.move(to: CGPoint(x: 84,y: 178)); roof.addLine(to: CGPoint(x: 140,y: 120))
            context.stroke(roof, with: .color(Color(red: 0.32,green: 0.40,blue: 0.49)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            rect(198, 119, 10, 27, Color(red: 0.40,green: 0.48,blue: 0.56))
            rect(105, 207, 29, 53, Color(red: 0.33,green: 0.42,blue: 0.51), radius: 2)
            rect(110, 231, 2, 8, .orange, radius: 1)
            rect(153, 207, 23, 29, .white, radius: 2)
            rect(210, 207, 35, 31, Color(red: 1,green: 0.78,blue: 0.42), radius: 2)
            rect(226, 207, 2, 31, .white); rect(210, 221, 35, 2, .white)
            rect(22, 260, 275, 1, cloud)
            rect(242, 246, 49, 14, Color(red: 0.65,green: 0.77,blue: 0.86), radius: 7)
            context.fill(Path(ellipseIn: CGRect(x: 256, y: 231, width: 23, height: 27)), with: .color(Color(red: 0.65,green: 0.77,blue: 0.86)))
            context.fill(Path(ellipseIn: CGRect(x: 206, y: 45, width: 88, height: 88)), with: .color(Color(red: 1,green: 0.94,blue: 0.88)))
            context.draw(Text(Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")).font(.system(size: 49, weight: .medium)).foregroundColor(Color(red: 1,green: 0.34,blue: 0)), at: CGPoint(x: 250,y: 89))
        }
    }
}

struct PhoneSettingsView: View {
    @ObservedObject var phone: PhoneModel
    @ObservedObject var home: HomeBrowser
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                        Section {
                            Label("Din iPhone, koblet til hjemmet", systemImage: "iphone.radiowaves.left.and.right")
                                .font(.headline)
                            Text(phone.status).foregroundStyle(.secondary)
                            if !phone.paired {
                                Button("Koble til denne telefonen") {
                                    Task {
                                        phone.busy = true; defer { phone.busy = false }
                                        do { try await home.pair(); phone.paired = true; try await phone.register() }
                                        catch { phone.error = error.localizedDescription }
                                    }
                                }.disabled(phone.busy)
                                Text("Åpne hjemmet og logg inn først. Telefonen kobles til denne brukeren.")
                                    .font(.footnote).foregroundStyle(.secondary)
                            } else {
                                Button("Kontroller registrering") { Task { do { try await phone.register() } catch { phone.error = error.localizedDescription } } }
                            }
                        }
                        Section("Posisjonsdeling") {
                            Toggle("Del posisjon med hjemmet", isOn: Binding(get: { phone.sharing }, set: { value in Task { await phone.setSharing(value) } }))
                                .disabled(!phone.paired || phone.busy)
                            Text("Når du deler posisjon, kan telefonen brukes som sporingsenhet under Hjem og personer. Andre med tilgang til personer kan se posisjonen din. Home Assistant kan lagre posisjonshistorikk.")
                                .font(.footnote).foregroundStyle(.secondary)
                            if phone.sharing && phone.permission == .authorizedWhenInUse {
                                Button("Tillat oppdateringer i bakgrunnen") { phone.enableBackground() }
                            }
                            if phone.sharing && (phone.permission == .denied || phone.permission == .restricted) {
                                Button("Åpne iPhone-innstillinger") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                            }
                            Text("iOS bestemmer når bakgrunnsposisjonen oppdateres. Dette er ikke kontinuerlig sanntidssporing. Når deling stoppes, kan siste kjente posisjon fortsatt finnes i hjemmets historikk.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Section("Varsler") {
                            Label(phone.notificationStatus, systemImage: "bell.badge")
                            if phone.paired {
                                Button("Aktiver varsler") { Task { await phone.enableNotifications() } }.disabled(phone.busy)
                                if phone.notificationsReady {
                                    Button("Send testvarsel") { Task { await phone.testNotification() } }.disabled(phone.busy)
                                    Button("Slå av varsler", role: .destructive) { Task { await phone.disableNotifications() } }
                                }
                            }
                            Button("Åpne varslingsinnstillinger") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                            Text("Når varsler er aktivert, kan du velge denne telefonen som mottaker i Home Assistant-automatiseringer.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        if phone.paired {
                            Section {
                                Button("Koble fra telefonen", role: .destructive) { Task { await phone.disconnect() } }.disabled(phone.busy)
                            }
                        }
                    }.navigationTitle("Denne telefonen")

                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Ferdig") { dismiss() } }
                }
                .safeAreaInset(edge: .bottom) {
                    Button("Fjernaksess – velg eller koble til hjem") { dismiss(); home.openPortal() }
                        .padding().frame(maxWidth: .infinity).background(.bar)
                }
        }
    }
}

@MainActor final class HomeBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKScriptMessageHandler {
    let webView: WKWebView
    @Published var failure: String?
    @Published var showPhoneSettings = false
    @Published var showScanner = false
    @Published var showDiscovery = false
    @Published var scanError: String?
    private var pendingSetupDevice: String?
    private var scanAfterDiscovery = false

    func requestScanner() {
        scanError = nil
        Task {
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            scanError = granted ? nil : "Kameratilgang er ikke tillatt. Tillat kamera i iPhone-innstillinger, eller skriv inn koden."
            showScanner = true
        }
    }

    func discoveryDismissed() {
        guard scanAfterDiscovery else { return }
        scanAfterDiscovery = false
        requestScanner()
    }

    func openDiscoveredHub(_ hub: DiscoveredHub) {
        guard UUID(uuidString: hub.id) != nil else { return }
        pendingSetupDevice = hub.state == "unconfigured" ? hub.id : nil
        if hub.state == "unconfigured" {
            lastPage = URL(string: "https://home.smarti.dev/activate?device=" + hub.id)!
        } else {
            guard hub.proof.range(of: "^[0-9]{10}\\.[0-9a-f]{64}$", options: .regularExpression) != nil else { return }
            lastPage = URL(string: "https://home.smarti.dev/activate#" + hub.id + "." + hub.proof)!
        }
        scanAfterDiscovery = true
        showDiscovery = false
        retry()
    }

    private var selectedSetupDevice: String? {
        if let pendingSetupDevice { return pendingSetupDevice }
        guard let url = webView.url, url.host == "home.smarti.dev", url.path == "/activate",
              let device = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "device" })?.value,
              UUID(uuidString: device) != nil else { return nil }
        return device
    }

    func openSetup() {
        lastPage = URL(string: "https://home.smarti.dev/activate" + (selectedSetupDevice.map { "?device=" + $0 } ?? ""))!
        retry()
    }
    @discardableResult func openActivation(_ value: String, forSelectedHub: Bool = false) -> Bool {
        guard let url = URL(string: value), url.scheme == "https", url.host == "home.smarti.dev",
              url.port == nil, url.user == nil, url.password == nil, url.path == "/activate",
              let fragment = url.fragment,
              fragment.range(of: "^[0-9a-f-]{36}\\.(?:v2\\.)?[0-9a-f]{64}$", options: .regularExpression) != nil else { return false }
        var destination = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        // Only an explicit in-app scan retains the chosen LAN hub. External links never reuse a stale selection.
        destination.queryItems = forSelectedHub ? selectedSetupDevice.map { [URLQueryItem(name: "device", value: $0)] } : nil
        if !forSelectedHub { pendingSetupDevice = nil }
        lastPage = destination.url!
        retry()
        return true
    }


    func openPortal() {
        pendingSetupDevice = nil
        lastPage = URL(string: "https://home.smarti.dev/")!
        retry()
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "smartiOnboarding", message.frameInfo.isMainFrame,
           message.frameInfo.request.url?.host == "home.smarti.dev", webView.url?.host == "home.smarti.dev",
           ["scan", "discover"].contains(message.body as? String ?? "") {
            if message.body as? String == "discover" { pendingSetupDevice = nil; showDiscovery = true; return }
            requestScanner()
            return
        }
        guard message.name == "smartiPhoneSettings", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, MobileClient.isHome(url),
              webView.url?.host == url.host else { return }
        switch message.body as? String {
        case "open": showPhoneSettings = true
        case "remote": openPortal()
        default: break
        }
    }
    private static let savedHomeKey = "smarti.lastSelectedHome"
    private var lastPage = URL(string: "https://home.smarti.dev/welcome")!
    private var recovery = WebRecoveryBudget()

    func retry() {
        failure = nil
        // Load the last approved main-frame URL with GET. Never replay a form POST.
        webView.load(URLRequest(url: lastPage))
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let url = webView.url, url.scheme == "https",
           url.host == "home.smarti.dev" || MobileClient.isHome(url) { lastPage = url }
        // Persist only the approved origin, never a login code, query or console URL.
        if let url = webView.url, MobileClient.isHome(url), let host = url.host {
            UserDefaults.standard.set("https://" + host + "/", forKey: Self.savedHomeKey)
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if recovery.allowAutomaticRecovery(at: ProcessInfo.processInfo.systemUptime) {
            retry()
        } else {
            failure = "Nettvisningen stoppet flere ganger. Du kan prøve igjen. Telefonens tilkobling er beholdt."
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }
    private func navigationFailed(_ error: Error) {
        let error = error as NSError
        guard !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else { return }
        failure = "Kunne ikke laste hjemmet. Kontroller internettforbindelsen og prøv igjen."
    }
    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(self, name: "smartiPhoneSettings")
        configuration.userContentController.add(self, name: "smartiOnboarding")
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if let saved = UserDefaults.standard.string(forKey: Self.savedHomeKey),
           let url = URL(string: saved), MobileClient.isHome(url), let host = url.host {
            lastPage = URL(string: "https://" + host + "/")!
        }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--preview-offline") {
            failure = "Offline preview"
            return
        }
        #endif
        retry()
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        // Embedded console frames remain governed by the hub's CSP. Native pairing only
        // uses the main frame's exact UUID home origin, never a child frame or message handler.
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if url.scheme == "https", url.host == "home.smarti.dev" || MobileClient.isHome(url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated && url.scheme == "https" { UIApplication.shared.open(url) }
        }
    }
    func pair() async throws {
        guard let url = webView.url, MobileClient.isHome(url),
              let origin = URL(string: "https://" + (url.host ?? "")) else {
            throw PhoneError.message("Åpne et hjem og logg inn først.")
        }
        let result = try await webView.callAsyncJavaScript("""
            const session = await fetch('/api/session', {credentials:'same-origin'});
            if (!session.ok) throw new Error('Logg inn på hjemmet først.');
            const user = await session.json();
            const response = await fetch('/api/mobile/pairings', {method:'POST', credentials:'same-origin',
              headers:{'X-CSRF-Token':user.csrf}});
            if (!response.ok) throw new Error('Oppdater huben og prøv igjen.');
            return await response.json();
            """, arguments: [:], in: nil, contentWorld: .page)
        guard webView.url?.host == origin.host, let invitation = result as? [String: Any],
              let installation = invitation["installation_id"] as? String,
              let code = invitation["code"] as? String else { throw PhoneError.message("Tilkoblingen ble avbrutt. Prøv igjen.") }
        try await MobileClient.shared.pair(origin: origin, installationID: installation, code: code, name: UIDevice.current.name)
    }
}

struct BrowserView: UIViewRepresentable {
    let browser: HomeBrowser
    func makeUIView(context: Context) -> WKWebView { browser.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    // WKWebView's content size must never become SwiftUI's proposed app width.
    // The dashboard owns scrolling inside the exact available safe-area bounds.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: WKWebView, context: Context) -> CGSize? {
        guard let width = proposal.width, let height = proposal.height else { return nil }
        return CGSize(width: width, height: height)
    }
}

struct HubScanner: View {
    @ObservedObject var home: HomeBrowser
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("Skann QR-koden under SMARTi-huben").font(.headline).padding()
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    HubCameraScanner(found: { value in
                        if home.openActivation(value, forSelectedHub: true) { dismiss() }
                        else { home.scanError = "Dette er ikke en SMARTi-hubetikett. Prøv koden under huben." }
                    }, failed: { home.scanError = $0 })
                } else {
                    Image(systemName: "qrcode.viewfinder").font(.system(size: 64))
                    Text("Kameraet er ikke tilgjengelig. Tillat kameratilgang i iPhone-innstillinger, eller skriv inn lenken fra etiketten.").padding()
                }
                if let error = home.scanError { Text(error).foregroundStyle(.red).padding() }
                Button("Skriv inn koden i stedet") { dismiss(); home.openSetup() }.padding()
            }.navigationTitle("Legg til hjem")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() } } }
        }
    }
}

// Start only once UIKit has presented the camera; failures must never disappear silently.
final class HubScannerController: UIViewController {
    let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, recognizesMultipleItems: false, isGuidanceEnabled: true, isHighlightingEnabled: true)
    var failed: ((String) -> Void)?
    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(scanner)
        scanner.view.frame = view.bounds
        scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scanner.view)
        scanner.didMove(toParent: self)
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        do { try scanner.startScanning() }
        catch { failed?("Kameraet kunne ikke starte. Lukk skanneren og prøv igjen, eller skriv inn koden.") }
    }
    override func viewWillDisappear(_ animated: Bool) {
        scanner.stopScanning()
        super.viewWillDisappear(animated)
    }
}

struct HubCameraScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    let failed: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(found: found, failed: failed) }
    func makeUIViewController(context: Context) -> HubScannerController {
        let controller = HubScannerController()
        controller.scanner.delegate = context.coordinator
        controller.failed = failed
        return controller
    }
    func updateUIViewController(_ controller: HubScannerController, context: Context) {}
    static func dismantleUIViewController(_ controller: HubScannerController, coordinator: Coordinator) { controller.scanner.stopScanning() }
    class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var lastValue: String?
        let failed: (String) -> Void
        init(found: @escaping (String) -> Void, failed: @escaping (String) -> Void) { self.found = found; self.failed = failed }
        func dataScanner(_ scanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
            failed("Skanneren er ikke tilgjengelig nå. Prøv igjen, eller skriv inn koden fra etiketten.")
        }
        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue, value != lastValue {
                    lastValue = value; found(value)
                }
            }
        }
    }
}


struct DiscoveredHub: Identifiable {
    let id: String
    let proof: String
    let state: String
    let model: String
    let serial: String
}

@MainActor final class HubDiscovery: NSObject, ObservableObject, NetServiceBrowserDelegate, NetServiceDelegate {
    @Published var hubs: [DiscoveredHub] = []
    @Published var hint = "Søker etter huber på lokalnettet …"
    private let browser = NetServiceBrowser()
    private var services: [NetService] = []
    private var found: [String: DiscoveredHub] = [:]
    private var timeout: Task<Void, Never>?

    func start() {
        stop()
        hint = "Søker etter huber på lokalnettet …"
        browser.delegate = self
        browser.searchForServices(ofType: "_smarti-setup._tcp.", inDomain: "local.")
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(12))
            guard !Task.isCancelled, let self, self.hubs.isEmpty else { return }
            self.hint = "Ingen hub funnet ennå. Kontroller strøm, nettverkskabel og at telefonen er på samme nettverk. Gjestenett kan blokkere søket."
        }
    }
    func stop() {
        timeout?.cancel(); timeout = nil
        browser.stop()
        for service in services { service.stopMonitoring(); service.stop() }
        services.removeAll(); found.removeAll(); hubs = []
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        guard services.count < 100 else { return }
        services.append(service); service.delegate = self
        // TXT monitoring avoids opening a connection or trusting a LAN-provided URL.
        service.startMonitoring()
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        found.removeValue(forKey: service.name)
        services.removeAll { $0 == service }
        service.stopMonitoring(); service.stop()
        refresh()
    }
    func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
        hint = "Lokalt søk er ikke tilgjengelig. Tillat Lokalnettverk under Innstillinger → SMARTi, eller bruk QR-koden."
    }
    func netService(_ sender: NetService, didUpdateTXTRecord data: Data) {
        let record = NetService.dictionary(fromTXTRecord: data)
        func value(_ key: String) -> String { record[key].flatMap { String(data: $0, encoding: .utf8) } ?? "" }
        let id = value("id"), proof = value("proof"), state = value("state")
        guard value("v") == "1", ["ready", "unconfigured"].contains(state), UUID(uuidString: id) != nil,
              state == "unconfigured" || proof.range(of: "^[0-9]{10}\\.[0-9a-f]{64}$", options: .regularExpression) != nil else {
            found.removeValue(forKey: sender.name); refresh(); return
        }
        found[sender.name] = DiscoveredHub(id: id, proof: proof, state: state, model: String(value("model").prefix(80)), serial: String(value("serial").prefix(80)))
        refresh()
    }
    private func refresh() {
        hubs = Dictionary(found.values.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest }).values.sorted { $0.id < $1.id }
        if !hubs.isEmpty { hint = "Velg huben din. Vi kontrollerer identiteten og ber om aktiveringskoden fra esken." }
    }
}

struct HubDiscoveryView: View {
    @ObservedObject var home: HomeBrowser
    @StateObject private var discovery = HubDiscovery()
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Et hjem begynner her", systemImage: "wifi.router").font(.title2.bold())
                    Text("Koble huben til strøm og nettverkskabel. Bruk samme lokalnett på iPhone.")
                    Text(discovery.hint).foregroundStyle(.secondary).accessibilityIdentifier("discovery-status")
                }
                Section("Huber på nettverket") {
                    ForEach(discovery.hubs) { hub in
                        Button { home.openDiscoveredHub(hub) } label: {
                            HStack {
                                Image(systemName: "house.fill").font(.title2)
                                VStack(alignment: .leading) {
                                    Text(hub.model.isEmpty ? "SMARTi Hub" : hub.model).font(.headline)
                                    Text(hub.serial.isEmpty ? String(hub.id.suffix(8)) : hub.serial).font(.caption)
                                    Text("Klar for oppsett").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(); Image(systemName: "chevron.right")
                            }.padding(.vertical, 8)
                        }
                    }
                    if discovery.hubs.isEmpty { ProgressView("Leter etter huber …") }
                }
                Section {
                    Button("Søk på nytt") { discovery.start() }
                    Button("Bruk QR-kode eller skriv inn kode") { dismiss(); home.openSetup() }
                    Button("Åpne iPhone-innstillinger") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                    Text("En ny hub vises automatisk når SMARTi er startet. Ingen forhåndskonfigurasjon er nødvendig. Internett kreves for å fullføre oppsettet.").font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Finn SMARTi-huben")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Lukk") { dismiss() } } }
                .onAppear { discovery.start() }.onDisappear { discovery.stop() }
        }
    }
}
