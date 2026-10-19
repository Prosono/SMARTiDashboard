@main struct RecoveryTests {
    static func main() {
        var budget = WebRecoveryBudget()
        precondition(budget.allowAutomaticRecovery(at: 100))
        precondition(budget.allowAutomaticRecovery(at: 110))
        precondition(!budget.allowAutomaticRecovery(at: 120))
        precondition(!budget.allowAutomaticRecovery(at: 159))
        precondition(budget.allowAutomaticRecovery(at: 160))
        precondition(!budget.allowAutomaticRecovery(at: 169))
        precondition(budget.allowAutomaticRecovery(at: 170))
        print("Recovery budget tests passed")
    }
}
