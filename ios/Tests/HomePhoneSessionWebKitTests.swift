// Standalone macOS WebKit regression check. Fetch is mocked; no real home is used.
import AppKit
import WebKit

@MainActor private final class ProbeNavigation: NSObject, WKNavigationDelegate {
    var loaded = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
}

@main struct HomePhoneSessionWebKitTests {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: configuration)
        let navigation = ProbeNavigation()
        web.navigationDelegate = navigation
        web.loadHTMLString("<html><body>Local startup check</body></html>", baseURL: nil)
        let deadline = Date().addingTimeInterval(30)
        while !navigation.loaded && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        precondition(navigation.loaded, "Local WebKit document failed to load")
        var finished = false
        Task { @MainActor in
            do {
                let rejectedFetch = "const fetch = async () => { throw new TypeError('simulated offline'); };"
                do {
                    _ = try await web.callAsyncJavaScript(rejectedFetch + """
                        const r = await fetch('/api/session');
                        if (!r.ok) return null;
                        return (await r.json()).id;
                        """, arguments: [:], in: nil, contentWorld: .page)
                    preconditionFailure("The previous startup probe should reject on a network failure")
                } catch {
                    precondition((error as NSError).domain == WKError.errorDomain)
                    print("Previous startup probe reproduced a WebKit JavaScript error (code \((error as NSError).code))")
                }
                let cases: [(String, HomePhoneSession)] = [
                    (rejectedFetch, .unavailable),
                    ("const fetch = async () => ({ok:true,status:200,json:async()=>({id:42})});", .authenticated(42)),
                    ("const fetch = async () => ({ok:false,status:401});", .signedOut),
                    ("const fetch = async () => ({ok:false,status:503});", .unavailable),
                    ("const fetch = async () => ({ok:true,status:200,json:async()=>{throw new SyntaxError('invalid JSON')}});", .unavailable),
                    ("const fetch = async () => ({ok:true,status:200,json:async()=>({id:null})});", .unavailable),
                    ("""
                     const setTimeout = callback => window.setTimeout(callback, 1);
                     const fetch = (_, options) => new Promise((_, reject) => {
                         options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                     });
                     """, .unavailable)
                ]
                for (mock, expected) in cases {
                    let result = try await web.callAsyncJavaScript(mock + HomePhoneSession.probe,
                        arguments: [:], in: nil, contentWorld: .page)
                    precondition(HomePhoneSession(result) == expected)
                }
                print("All seven startup probe scenarios resolve safely in WebKit")
                finished = true
            } catch {
                fatalError("Unexpected bridge failure: \((error as NSError).domain) / \((error as NSError).code)")
            }
        }
        let completionDeadline = Date().addingTimeInterval(30)
        while !finished && Date() < completionDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        precondition(finished, "WebKit probe test timed out")
    }
}
