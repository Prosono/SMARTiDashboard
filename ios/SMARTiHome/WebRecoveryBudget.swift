struct WebRecoveryBudget {
    private var attempts: [Double] = []
    mutating func allowAutomaticRecovery(at now: Double) -> Bool {
        attempts.removeAll { now - $0 >= 60 }
        guard attempts.count < 2 else { return false }
        attempts.append(now)
        return true
    }
}
