import Foundation

@main struct HomePhoneSyncTests {
    static func main() {
        var sync = HomePhoneSync()
        precondition(sync.begin() == nil, "Foreground activation must wait for the document")
        sync.navigationFinished()
        let first = sync.begin()!
        precondition(sync.begin() == nil, "Overlapping signals must not run two checks")
        precondition(sync.finish(first, unavailable: false) == 0, "Keep a signal received during a check")
        let second = sync.begin()!
        precondition(sync.finish(second, unavailable: false) == nil)

        // A slow check must never reconnect credentials after navigation, even to the same host.
        let old = sync.begin()!
        sync.navigationStarted()
        precondition(!sync.isCurrent(old))
        precondition(sync.begin() == nil)
        sync.navigationFinished()
        precondition(sync.begin() == nil)
        precondition(sync.finish(old, unavailable: true) == 0)
        let current = sync.begin()!
        precondition(current != old && sync.isCurrent(current))
        precondition(sync.finish(current, unavailable: true) == 1)
        let retry = sync.begin()!
        precondition(sync.finish(retry, unavailable: true) == 3)
        let lastRetry = sync.begin()!
        precondition(sync.finish(lastRetry, unavailable: true) == nil, "No endless background retry")
        let success = sync.begin()!
        precondition(sync.finish(success, unavailable: false) == nil)
        let afterSuccess = sync.begin()!
        precondition(sync.finish(afterSuccess, unavailable: true) == 1)

        // Logout/failed navigation invalidate the result and cancel its recovery.
        let abandoned = sync.begin()!
        sync.navigationStarted()
        precondition(sync.finish(abandoned, unavailable: true) == nil)
        precondition(!sync.isCurrent(abandoned))
        precondition(sync.finish(abandoned, unavailable: true) == nil)

        precondition(HomePhoneSession(["status": "ready", "user": 42]) == .authenticated(42))
        precondition(HomePhoneSession(["status": "signed_out"]) == .signedOut)
        for result: Any? in [nil, [:], ["status": "unavailable"], ["status": "ready", "user": "42"],
                            ["status": "ready", "user": true], ["status": "ready", "user": 0],
                            ["status": "ready", "user": 1.5], ["status": "ready", "user": Double.infinity]] {
            precondition(HomePhoneSession(result) == .unavailable, "Ambiguous results must not change credentials")
        }
        print("Phone startup lifecycle, bounded recovery and session decoding tests passed")
    }
}
