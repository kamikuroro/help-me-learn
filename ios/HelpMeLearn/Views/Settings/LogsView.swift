import SwiftUI

struct LogsView: View {
    @State private var logs: [LogEntry] = []
    @State private var isConnected = false
    @State private var task: Task<Void, Never>?
    @State private var autoScroll = true

    var body: some View {
        VStack(spacing: 0) {
            // Connection status
            HStack {
                Circle()
                    .fill(isConnected ? .green : .red)
                    .frame(width: 8, height: 8)
                Text(isConnected ? "Connected" : "Disconnected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(logs.count) entries")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Clear") { logs.removeAll() }
                    .font(.caption)
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
            .background(Color(uiColor: .systemGray6))

            // Log entries
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(logs) { entry in
                            LogRow(entry: entry)
                                .id(entry.id)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }
                .onChange(of: logs.count) {
                    if autoScroll, let last = logs.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .navigationTitle("Server Logs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Toggle(isOn: $autoScroll) {
                    Image(systemName: "arrow.down.to.line")
                }
            }
        }
        .onAppear { startStreaming() }
        .onDisappear { task?.cancel() }
    }

    private func startStreaming() {
        let settings = SettingsService.shared
        guard settings.isConfigured,
              let url = URL(string: "\(settings.serverURL)/api/logs/stream") else { return }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(settings.authToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 86400 // 24 hours

        task = Task {
            // Reconnect loop — retries on disconnect
            while !Task.isCancelled {
                do {
                    let (stream, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        try? await Task.sleep(for: .seconds(3))
                        continue
                    }

                    await MainActor.run { isConnected = true }

                    for try await line in stream.lines {
                        if Task.isCancelled { break }
                        // Skip SSE comments (keepalives like ":ok")
                        guard line.hasPrefix("data: ") else { continue }
                        let json = String(line.dropFirst(6))
                        let entry = LogEntry(raw: json)
                        await MainActor.run {
                            logs.append(entry)
                            if logs.count > 500 { logs.removeFirst(logs.count - 500) }
                        }
                    }
                } catch {
                    // Stream ended or failed
                }
                await MainActor.run { isConnected = false }
                // Wait before reconnecting
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }
}

struct LogEntry: Identifiable {
    let id = UUID()
    let timestamp: Date
    let level: String
    let message: String
    let raw: String

    init(raw: String) {
        self.raw = raw

        // Parse JSON log line
        if let data = raw.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            self.level = json["level"] as? String ?? "info"
            self.message = Self.formatMessage(json)
            if let timeStr = json["time"] as? String {
                let fmt = ISO8601DateFormatter()
                fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                self.timestamp = fmt.date(from: timeStr) ?? Date()
            } else {
                self.timestamp = Date()
            }
        } else {
            self.level = "info"
            self.message = raw.prefix(200).description
            self.timestamp = Date()
        }
    }

    /// Build a human-readable message from structured log fields
    private static func formatMessage(_ json: [String: Any]) -> String {
        let event = json["event"] as? String
        let msg = json["msg"] as? String

        switch event {
        case "http_request":
            let method = json["method"] as? String ?? "?"
            let path = json["path"] as? String ?? "?"
            let status = json["status"] as? Int ?? 0
            let duration = json["duration_ms"] as? Int ?? 0
            return "\(method) \(path) → \(status) (\(duration)ms)"

        case "ingest_start":
            let sid = json["source_id"] as? Int ?? 0
            return "Ingestion started #\(sid)"

        case "ingest_complete":
            let sid = json["source_id"] as? Int ?? 0
            let dur = json["duration_ms"] as? Int ?? 0
            return "Ingestion complete #\(sid) (\(dur)ms)"

        case "ingest_failed":
            let sid = json["source_id"] as? Int ?? 0
            return "Ingestion FAILED #\(sid)"

        case "ingest_step":
            let step = json["step"] as? String ?? "?"
            let sid = json["source_id"] as? Int ?? (json["source_id"] as? String).flatMap { _ in 0 } ?? 0
            return "Ingest step: \(step) #\(sid)"

        case "claude_invoke":
            let purpose = json["purpose"] as? String ?? ""
            let dur = json["duration_ms"] as? Int ?? 0
            return "Claude (\(dur/1000)s) \(purpose.prefix(40))"

        case "chat_response":
            let dur = json["duration_ms"] as? Int ?? 0
            let type = json["type"] as? String ?? ""
            return "Chat response [\(type)] (\(dur/1000)s)"

        case "tts_start":
            let sid = json["source_id"] as? Int ?? 0
            let type = json["type"] as? String ?? ""
            return "TTS start #\(sid) (\(type))"

        case "tts_complete":
            let sid = json["source_id"] as? Int ?? 0
            let dur = json["duration_ms"] as? Int ?? 0
            return "TTS complete #\(sid) (\(dur/1000)s)"

        case "tts_generate":
            let chars = json["chars"] as? Int ?? 0
            let segs = json["segments"] as? Int ?? 0
            return "TTS generated \(chars) chars, \(segs) segments"

        case "hybrid_search":
            let hits = json["merged_hits"] as? Int ?? 0
            let dur = json["duration_ms"] as? Int ?? 0
            return "Search: \(hits) results (\(dur)ms)"

        case "jina_embed":
            let batch = json["batch_size"] as? Int ?? 0
            return "Jina embed batch=\(batch)"

        default:
            // Fall back to msg, then event, then raw
            return msg ?? event ?? String(json.description.prefix(200))
        }
    }
}

struct LogRow: View {
    let entry: LogEntry

    var levelColor: Color {
        switch entry.level {
        case "error": .red
        case "warn": .orange
        case "debug": .gray
        default: .primary
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Text(entry.level.prefix(4).uppercased())
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(levelColor)
                .frame(width: 36, alignment: .leading)

            Text(entry.message)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(3)
                .textSelection(.enabled)
        }
        .padding(.vertical, 1)
    }
}
