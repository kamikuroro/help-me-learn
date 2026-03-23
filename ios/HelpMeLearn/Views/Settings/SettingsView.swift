import SwiftUI

struct SettingsView: View {
    @State private var settings = SettingsService.shared
    @State private var isCheckingHealth = false
    @State private var healthStatus: String?
    @State private var quota: AudioQuota?

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

                    if let quota, let limit = quota.characterLimit, let count = quota.characterCount, let remaining = quota.charactersRemaining {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("ElevenLabs Quota")
                                Spacer()
                                Text("\(formatK(count)) / \(formatK(limit))")
                                    .foregroundStyle(.secondary)
                            }
                            ProgressView(value: Double(count), total: Double(max(limit, 1)))
                                .tint(remaining < 5000 ? .orange : .blue)
                            Text("\(formatK(remaining)) characters remaining")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
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
            .task {
                do { quota = try await APIClient.shared.getAudioQuota() } catch {}
            }
        }
    }

    private func formatK(_ n: Int) -> String {
        if n >= 1000 {
            return String(format: "%.1fk", Double(n) / 1000.0)
        }
        return "\(n)"
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
