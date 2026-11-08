import Foundation
import CoreFoundation

/// Only one native phone check may run, and its result belongs to one document.
struct HomePhoneSync {
    private(set) var document = UUID()
    private(set) var ready = false
    private var active: UUID?
    private var pending = false
    private var retries = 0

    mutating func navigationStarted() {
        document = UUID()
        ready = false
        pending = false
        retries = 0
    }

    mutating func navigationFinished() { ready = true }

    mutating func begin() -> UUID? {
        guard ready else { return nil }
        guard active == nil else { pending = true; return nil }
        active = document
        return document
    }

    func isCurrent(_ token: UUID) -> Bool { ready && token == document }

    /// Only read-only session probe failures schedule timed retries.
    mutating func finish(_ token: UUID, unavailable: Bool) -> Double? {
        guard active == token else { return nil }
        active = nil
        let requested = pending
        pending = false
        guard ready else { return nil }
        guard token == document else { return 0 }
        if unavailable {
            guard retries < 2 else { return nil }
            retries += 1
            return retries == 1 ? 1 : 3
        }
        retries = 0
        return requested ? 0 : nil
    }
}

enum HomePhoneSession: Equatable {
    case authenticated(Int), signedOut, unavailable

    init(_ result: Any?) {
        guard let result = result as? [String: Any] else { self = .unavailable; return }
        if result["status"] as? String == "signed_out" { self = .signedOut; return }
        guard result["status"] as? String == "ready",
              let number = result["user"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue > 0, number.doubleValue <= 9_007_199_254_740_991,
              number.doubleValue.rounded() == number.doubleValue else { self = .unavailable; return }
        self = .authenticated(number.intValue)
    }

    // Expected network/HTTP/JSON failures are data, not rejected WebKit promises.
    static let probe = """
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch('/api/session', {
                credentials: 'same-origin', cache: 'no-store', signal: controller.signal
            });
            if (response.status === 401) return {status: 'signed_out'};
            if (!response.ok) return {status: 'unavailable'};
            const session = await response.json();
            return Number.isSafeInteger(session.id) && session.id > 0
                ? {status: 'ready', user: session.id} : {status: 'unavailable'};
        } catch {
            return {status: 'unavailable'};
        } finally {
            clearTimeout(timer);
        }
        """
}
