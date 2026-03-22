import Foundation
import Security
import SwiftUI

@Observable
final class SettingsService {
    static let shared = SettingsService()

    private let defaults: UserDefaults
    private let appGroupId = "group.com.helpmelearn.shared"
    private let keychainService = "com.helpmelearn.app"

    var serverURL: String {
        didSet { defaults.set(serverURL, forKey: "serverURL") }
    }

    var authToken: String {
        didSet { saveToKeychain(key: "authToken", value: authToken) }
    }

    var playbackSpeed: Float {
        didSet { defaults.set(playbackSpeed, forKey: "playbackSpeed") }
    }

    var preferSummaryAudio: Bool {
        didSet { defaults.set(preferSummaryAudio, forKey: "preferSummaryAudio") }
    }

    var chatAudioEnabled: Bool {
        didSet { defaults.set(chatAudioEnabled, forKey: "chatAudioEnabled") }
    }

    private init() {
        self.defaults = UserDefaults(suiteName: appGroupId) ?? .standard
        self.serverURL = defaults.string(forKey: "serverURL") ?? "http://localhost:3741"
        self.authToken = Self.loadFromKeychain(service: "com.helpmelearn.app", key: "authToken") ?? ""
        self.playbackSpeed = defaults.float(forKey: "playbackSpeed").nonZero ?? 1.0
        self.preferSummaryAudio = defaults.bool(forKey: "preferSummaryAudio")
        self.chatAudioEnabled = defaults.bool(forKey: "chatAudioEnabled")
    }

    var isConfigured: Bool {
        !serverURL.isEmpty && !authToken.isEmpty
    }

    private func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: appGroupId,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func loadFromKeychain(service: String, key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: "group.com.helpmelearn.shared",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

private extension Float {
    var nonZero: Float? {
        self == 0 ? nil : self
    }
}
