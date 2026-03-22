import SwiftUI

struct SettingsView: View {
    @State private var settings = SettingsService.shared
    @State private var isCheckingHealth = false
    @State private var healthStatus: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Server Connection") {
                    TextField("Server URL", text: $settings.serverURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    SecureField("Auth Token", text: $settings.authToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button(action: checkHealth) {
                        HStack {
                            Text("Test Connection")
                            Spacer()
                            if isCheckingHealth {
                                ProgressView()
                            } else if let status = healthStatus {
                                Image(systemName: status == "ok" ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundStyle(status == "ok" ? .green : .red)
                            }
                        }
                    }
                    .disabled(isCheckingHealth || !settings.isConfigured)
                }

                Section("Audio") {
                    Picker("Default Playback Speed", selection: $settings.playbackSpeed) {
                        Text("0.75x").tag(Float(0.75))
                        Text("1x").tag(Float(1.0))
                        Text("1.25x").tag(Float(1.25))
                        Text("1.5x").tag(Float(1.5))
                        Text("2x").tag(Float(2.0))
                        Text("2.5x").tag(Float(2.5))
                    }

                    Toggle("Prefer Summary Audio", isOn: $settings.preferSummaryAudio)

                    Toggle("Audio Chat Responses", isOn: $settings.chatAudioEnabled)
                }

                Section("Developer") {
                    NavigationLink {
                        LogsView()
                    } label: {
                        Label("Server Logs", systemImage: "terminal")
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: "0.1.0")
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func checkHealth() {
        isCheckingHealth = true
        healthStatus = nil
        Task {
            do {
                let health = try await APIClient.shared.healthCheck()
                healthStatus = health.status
            } catch {
                healthStatus = "error"
            }
            isCheckingHealth = false
        }
    }
}
