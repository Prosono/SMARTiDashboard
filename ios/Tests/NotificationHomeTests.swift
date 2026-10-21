import Foundation

@main struct NotificationHomeTests {
    static func main() {
        let cloudHome = "9be57432-789f-4939-b7f9-355091c7cdf0"
        let origin = URL(string: "https://\(cloudHome).home.smarti.dev")!
        // The pairing installation ID is deliberately unrelated to the cloud ID.
        let credentials = PhoneCredentials(origin: origin, installationID: UUID().uuidString,
            deviceID: UUID().uuidString, accessToken: "", refreshToken: "", expiresAt: 0)
        precondition(MobileClient.matchesNotificationHome(cloudHome, origin: credentials.origin))
        precondition(MobileClient.matchesNotificationHome(cloudHome.uppercased(), origin: origin))
        precondition(!MobileClient.matchesNotificationHome(credentials.installationID, origin: origin))
        precondition(!MobileClient.matchesNotificationHome("invalid", origin: origin))
        for address in [
            "http://\(cloudHome).home.smarti.dev",
            "https://\(cloudHome).home.smarti.dev.evil.example",
            "https://home.smarti.dev",
            "https://\(cloudHome).home.smarti.dev:444",
        ] {
            precondition(!MobileClient.matchesNotificationHome(cloudHome, origin: URL(string: address)!))
        }
        var other = PhoneCredentials(origin: origin, installationID: credentials.installationID,
            deviceID: UUID().uuidString, accessToken: "", refreshToken: "", expiresAt: 0)
        precondition(credentials.scope != other.scope)
        other = PhoneCredentials(origin: URL(string: "https://11111111-1111-4111-8111-111111111111.home.smarti.dev")!,
            installationID: credentials.installationID, deviceID: credentials.deviceID,
            accessToken: "", refreshToken: "", expiresAt: 0)
        precondition(credentials.scope != other.scope)
        print("Notification home and account-scope tests passed")
    }
}
