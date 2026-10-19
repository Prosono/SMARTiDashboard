import SwiftUI
import WebKit
import VisionKit
import AVFoundation

@main struct SMARTiHomeApp: App {
    @StateObject private var phone = PhoneModel()
    @StateObject private var home = HomeBrowser()
    var body: some Scene {
        WindowGroup {
            GeometryReader { geometry in
                BrowserView(browser: home)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .overlay {
                        if let message = home.failure {
                            VStack(spacing: 18) {
                                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath").font(.largeTitle)
                                Text("Visningen ble avbrutt").font(.title2.bold())
                                Text(message).multilineTextAlignment(.center).foregroundStyle(.secondary)
                                Button("Prøv igjen") { home.retry() }.buttonStyle(.borderedProminent)
                                Button("Velg hjem") { home.openPortal() }
                            }.padding(28).frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(.background)
                        }
                    }
            }
            .ignoresSafeArea(.container)
            .sheet(isPresented: $home.showPhoneSettings) {
                PhoneSettingsView(phone: phone, home: home)
            }
            .sheet(isPresented: $home.showScanner) { HubScanner(home: home) }
            .sheet(isPresented: $home.showDiscovery, onDismiss: { home.discoveryDismissed() }) { HubDiscoveryView(home: home) }
            .onOpenURL { url in _ = home.openActivation(url.absoluteString) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL { _ = home.openActivation(url.absoluteString) }
            }
            .tint(Color(red: 0.87, green: 0.32, blue: 0.03))
            .alert("SMARTi", isPresented: Binding(get: { phone.error != nil }, set: { if !$0 { phone.error = nil } })) {
                Button("OK") { phone.error = nil }
            } message: { Text(phone.error ?? "") }
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
                            Label("Klargjøres for pushvarsler", systemImage: "bell.badge")
                            Text("Pushvarsler aktiveres når Apples signering og SMARTis varslingsserver er satt opp. Ingen varsler leveres av denne utviklingsversjonen ennå.")
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
              fragment.range(of: "^[0-9a-f-]{36}\\.[0-9a-f]{64}$", options: .regularExpression) != nil else { return false }
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
