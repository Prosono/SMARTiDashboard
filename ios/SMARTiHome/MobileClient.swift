import Foundation
import Security

struct PhoneCredentials: Codable {
    let origin: URL
    let installationID: String
    let deviceID: String
    var accessToken: String
    var refreshToken: String
    var expiresAt: Double
    var scope: String { origin.absoluteString + "|" + installationID + "|" + deviceID }
}

struct TokenResponse: Decodable {
    let installation_id: String
    let device_id: String
    let access_token: String
    let refresh_token: String
    let expires_at: Double
}

struct CompanionStatus: Decodable {
    let registered: Bool
    let location_enabled: Bool
    let notifications_ready: Bool
}

enum PhoneError: LocalizedError {
    case unauthorized
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return "Telefonens tilgang har utløpt. Koble telefonen til hjemmet igjen." }
}

enum CredentialStore {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "dev.smarti.home.phone", kSecAttrAccount as String: "current"]
    static func load() -> PhoneCredentials? {
        var q = query; q[kSecReturnData as String] = true
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(PhoneCredentials.self, from: data)
    }
    static func save(_ value: PhoneCredentials) throws {
        let data = try JSONEncoder().encode(value)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let result = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if result == errSecItemNotFound {
            guard SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess
            else { throw PhoneError.message("Kunne ikke lagre tilkoblingen sikkert.") }
        } else if result != errSecSuccess { throw PhoneError.message("Kunne ikke oppdatere tilkoblingen sikkert.") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

actor MobileClient {
    static let shared = MobileClient()
    private var credentials = CredentialStore.load()
    private var generation = UUID()
    private var refreshTask: Task<PhoneCredentials, Error>?
    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil; c.timeoutIntervalForRequest = 20
        return URLSession(configuration: c, delegate: NoRedirects(), delegateQueue: nil)
    }()

    static func isHome(_ url: URL) -> Bool {
        guard url.scheme == "https", url.port == nil, url.user == nil, url.password == nil,
              let host = url.host, host.hasSuffix(".home.smarti.dev") else { return false }
        return UUID(uuidString: String(host.dropLast(".home.smarti.dev".count))) != nil
    }

    static func matchesNotificationHome(_ home: String, origin: URL) -> Bool {
        // APNs identifies the cloud home, not MobileAuth's separate local installation.
        guard isHome(origin), let host = origin.host,
              let expected = UUID(uuidString: home),
              let connected = UUID(uuidString: String(host.dropLast(".home.smarti.dev".count)))
        else { return false }
        return expected == connected
    }

    func paired() -> Bool { credentials != nil }
    func origin() -> URL? { credentials?.origin }

    private func request(origin: URL, path: String, method: String = "POST", body: Data?, token: String? = nil) async throws -> Data {
        guard Self.isHome(origin) else { throw PhoneError.message("Ugyldig hjemmeadresse.") }
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var endpoint = URLComponents(url: origin.appendingPathComponent("api/mobile/v1/" + parts[0]), resolvingAgainstBaseURL: false)!
        if parts.count == 2 { endpoint.percentEncodedQuery = parts[1] }
        var r = URLRequest(url: endpoint.url!)
        r.httpMethod = method; r.httpBody = body
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: r)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { throw PhoneError.unauthorized }
            if response.statusCode == 404 { throw PhoneError.message("Oppdater SMARTi på huben før du kobler til telefonen.") }
            throw PhoneError.message("Hjemmet kunne ikke fullføre handlingen (\(response.statusCode)). Prøv igjen når forbindelsen er tilbake.")
        }
        return data
    }

    func pair(origin: URL, installationID: String, code: String, name: String) async throws {
        let epoch = generation
        let body = try JSONSerialization.data(withJSONObject: ["installation_id": installationID, "code": code, "device_name": name])
        let data = try await request(origin: origin, path: "pair", body: body)
        let result = try JSONDecoder().decode(TokenResponse.self, from: data)
        let value = PhoneCredentials(origin: origin, installationID: result.installation_id, deviceID: result.device_id,
            accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: result.expires_at)
        guard generation == epoch else { throw CancellationError() }
        generation = UUID()
        try CredentialStore.save(value); credentials = value
    }

    private func authorized() async throws -> PhoneCredentials {
        guard let current = credentials, CredentialStore.load()?.scope == current.scope else { throw PhoneError.message("Koble telefonen til hjemmet først.") }
        if current.expiresAt > Date().timeIntervalSince1970 + 60 { return current }
        if let task = refreshTask { return try await task.value }
        let epoch = generation
        let task = Task<PhoneCredentials, Error> {
            let body = try JSONSerialization.data(withJSONObject: ["installation_id": current.installationID, "refresh_token": current.refreshToken])
            let data = try await self.request(origin: current.origin, path: "refresh", body: body)
            let result = try JSONDecoder().decode(TokenResponse.self, from: data)
            var updated = current
            updated.accessToken = result.access_token; updated.refreshToken = result.refresh_token; updated.expiresAt = result.expires_at
            guard self.generation == epoch, CredentialStore.load()?.scope == current.scope else { throw CancellationError() }
            try CredentialStore.save(updated)
            return updated
        }
        refreshTask = task
        do {
            let updated = try await task.value
            guard generation == epoch, CredentialStore.load()?.scope == current.scope else { throw CancellationError() }
            credentials = updated; refreshTask = nil; return updated
        } catch {
            // Keep credentials on transient failures. The server rejects and revokes
            // a rotated-token replay; only a definitive 401 clears the local pair.
            if generation == epoch {
                refreshTask = nil
                if case PhoneError.unauthorized = error { credentials = nil; CredentialStore.clear() }
            }
            throw error
        }
    }

    @discardableResult func send(_ path: String, method: String = "POST", body: [String: Any] = [:], expectedScope: String? = nil) async throws -> Data {
        let current = try await authorized()
        if let expectedScope, current.scope != expectedScope { throw CancellationError() }
        let epoch = generation
        let data = try await request(origin: current.origin, path: path, method: method,
            body: method == "GET" ? nil : JSONSerialization.data(withJSONObject: body), token: current.accessToken)
        guard generation == epoch, CredentialStore.load()?.scope == current.scope else { throw CancellationError() }
        return data
    }
    func forget() async {
        let old = credentials
        generation = UUID()
        credentials = nil; CredentialStore.clear()
        refreshTask?.cancel(); refreshTask = nil
        if let old {
            _ = try? await request(origin: old.origin, path: "logout", body: nil, token: old.accessToken)
        }
    }
    func disconnect() async throws {
        try await send("logout")
        credentials = nil; CredentialStore.clear()
    }
}
