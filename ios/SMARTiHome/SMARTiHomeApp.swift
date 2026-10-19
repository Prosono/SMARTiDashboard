import SwiftUI
import WebKit

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
            .sheet(isPresented: $home.showPhoneSettings) {
                PhoneSettingsView(phone: phone, home: home)
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
                    Button("Velg et annet hjem") { dismiss(); home.openPortal() }
                        .padding().frame(maxWidth: .infinity).background(.bar)
                }
        }
    }
}

@MainActor final class HomeBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKScriptMessageHandler {
    let webView: WKWebView
    @Published var failure: String?
    @Published var showPhoneSettings = false

    func openPortal() {
        lastPage = URL(string: "https://home.smarti.dev/")!
        retry()
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "smartiPhoneSettings", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, MobileClient.isHome(url),
              webView.url?.host == url.host,
              message.body as? String == "open" else { return }
        showPhoneSettings = true
    }
    private var lastPage = URL(string: "https://home.smarti.dev/")!
    private var recovery = WebRecoveryBudget()

    func retry() {
        failure = nil
        // Load the last approved main-frame URL with GET. Never replay a form POST.
        webView.load(URLRequest(url: lastPage))
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let url = webView.url, url.scheme == "https",
           url.host == "home.smarti.dev" || MobileClient.isHome(url) { lastPage = url }
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
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: "https://home.smarti.dev/")!))
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
