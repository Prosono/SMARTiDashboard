import SwiftUI
import CoreLocation
import UserNotifications

@MainActor final class PhoneModel: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published var paired = false
    @Published var sharing = false
    @Published var busy = false
    @Published var status = "Logg inn på hjemmet ditt, og velg Koble til denne telefonen."
    @Published var error: String?
    @Published var permission: CLAuthorizationStatus = .notDetermined
    private let location = CLLocationManager()
    private var sending = false
    private var lastSent: Date = .distantPast

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyHundredMeters
        location.distanceFilter = 100
        permission = location.authorizationStatus
        Task { await refresh() }
    }
    func refresh() async {
        paired = await MobileClient.shared.paired()
        guard paired else { return }
        do {
            let data = try await MobileClient.shared.send("companion", method: "GET")
            let info = try JSONDecoder().decode(CompanionStatus.self, from: data)
            sharing = info.location_enabled
            status = info.registered ? "Telefonen er registrert i hjemmet." : "Telefonen er koblet til. Fullfør registreringen."
            if sharing { startLocation() }
        } catch { self.error = error.localizedDescription }
    }
    func register() async throws {
        try await MobileClient.shared.send("companion", body: ["name": UIDevice.current.name,
            "model": UIDevice.current.model, "os_version": UIDevice.current.systemVersion,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1"])
        await refresh()
    }
    func setSharing(_ enabled: Bool) async {
        busy = true; defer { busy = false }
        if !enabled { stopLocation() }
        do {
            if enabled { try await register() }
            try await MobileClient.shared.send("location-consent", method: "PUT", body: ["enabled": enabled])
            sharing = enabled
            if enabled {
                if permission == .notDetermined { location.requestWhenInUseAuthorization() }
                else { startLocation() }
            }
        } catch { self.error = error.localizedDescription }
    }
    func enableBackground() { location.requestAlwaysAuthorization() }
    func startLocation() {
        guard sharing, permission == .authorizedAlways || permission == .authorizedWhenInUse else { return }
        location.requestLocation()
        if permission == .authorizedAlways && CLLocationManager.significantLocationChangeMonitoringAvailable() {
            location.startMonitoringSignificantLocationChanges()
        }
    }
    private func stopLocation() {
        location.stopMonitoringSignificantLocationChanges(); location.stopUpdatingLocation()
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        permission = manager.authorizationStatus
        if permission == .denied || permission == .restricted { stopLocation() }
        else { startLocation() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code != .locationUnknown { self.error = "Posisjonen er ikke tilgjengelig akkurat nå." }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard sharing, !sending, let point = locations.last, point.horizontalAccuracy >= 0,
              point.horizontalAccuracy <= 1000, abs(point.timestamp.timeIntervalSinceNow) < 600,
              point.timestamp.timeIntervalSince(lastSent) > 30 else { return }
        sending = true
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "SMARTi location")
        Task {
            defer {
                sending = false
                if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) }
            }
            do {
                try await MobileClient.shared.send("location", body: ["latitude": point.coordinate.latitude,
                    "longitude": point.coordinate.longitude, "accuracy": point.horizontalAccuracy,
                    "timestamp": point.timestamp.timeIntervalSince1970])
                lastSent = point.timestamp
                status = "Posisjon sendt \(point.timestamp.formatted(date: .omitted, time: .shortened))."
            } catch { self.error = error.localizedDescription }
        }
    }
    func disconnect() async {
        stopLocation(); busy = true; defer { busy = false }
        do { try await MobileClient.shared.disconnect(); sharing = false; paired = false; status = "Telefonen er koblet fra." }
        catch { self.error = error.localizedDescription }
    }
}
