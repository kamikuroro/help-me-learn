import SwiftUI

struct SourceRowView: View {
    let source: Source
    let onGenerateAudio: (String) -> Void
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var generatingSummary = false
    @State private var generatingFull = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(source.title ?? "Untitled")
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                StatusBadge(status: source.status)
            }

            if let summary = source.summary {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            HStack {
                if let category = source.category {
                    Text(category.replacingOccurrences(of: "_", with: " "))
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.blue.opacity(0.1))
                        .clipShape(Capsule())
                }
                if let count = source.wordCount {
                    Text("\(count) words")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            if source.isReady {
                HStack(spacing: 12) {
                    // Summary audio button
                    if source.hasSummaryAudio {
                        Button(action: {
                            audioPlayer.playAudio(
                                sourceId: source.id,
                                type: "summary",
                                title: source.title ?? "Summary"
                            )
                        }) {
                            Label("Summary", systemImage: "play.circle")
                                .font(.caption)
                        }
                    } else if generatingSummary {
                        GeneratingButton(label: "Summary")
                    } else {
                        Button(action: {
                            generatingSummary = true
                            onGenerateAudio("summary")
                            pollForAudio(type: "summary")
                        }) {
                            Label("Gen Summary", systemImage: "waveform")
                                .font(.caption)
                        }
                    }

                    // Full audio button
                    if source.hasFullAudio {
                        Button(action: {
                            audioPlayer.playAudio(
                                sourceId: source.id,
                                type: "full",
                                title: source.title ?? "Full Article"
                            )
                        }) {
                            Label("Full", systemImage: "play.circle.fill")
                                .font(.caption)
                        }
                    } else if generatingFull {
                        GeneratingButton(label: "Full")
                    } else {
                        Button(action: {
                            generatingFull = true
                            onGenerateAudio("full")
                            pollForAudio(type: "full")
                        }) {
                            Label("Gen Full", systemImage: "waveform")
                                .font(.caption)
                        }
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            } else if source.isProcessing {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Processing: \(source.status)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func pollForAudio(type: String) {
        Task {
            for _ in 0..<60 { // poll up to 3 minutes
                try? await Task.sleep(for: .seconds(3))
                do {
                    let updated = try await APIClient.shared.getSource(id: source.id)
                    let ready = type == "summary" ? updated.audioSummaryPath != nil : updated.audioFullPath != nil
                    if ready {
                        if type == "summary" { generatingSummary = false }
                        else { generatingFull = false }
                        return
                    }
                } catch {
                    break
                }
            }
            // Timeout — stop animating
            if type == "summary" { generatingSummary = false }
            else { generatingFull = false }
        }
    }
}

struct GeneratingButton: View {
    let label: String
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            WaveformAnimation()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(.systemGray5))
        .clipShape(Capsule())
    }
}

struct WaveformAnimation: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1)
                    .fill(.blue)
                    .frame(width: 2, height: animating ? 12 : 4)
                    .animation(
                        .easeInOut(duration: 0.4)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.15),
                        value: animating
                    )
            }
        }
        .frame(height: 12)
        .onAppear { animating = true }
    }
}

struct StatusBadge: View {
    let status: String

    var color: Color {
        switch status {
        case "ready": .green
        case "failed": .red
        case "pending": .gray
        default: .orange
        }
    }

    var body: some View {
        Text(status)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
