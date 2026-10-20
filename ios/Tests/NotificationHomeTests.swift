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
        print("Notification home routing tests passed")
    }
}
