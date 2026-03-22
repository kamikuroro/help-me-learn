import SwiftUI

struct SourceRowView: View {
    let source: Source
    let onGenerateAudio: (String) -> Void
    @State private var audioPlayer = AudioPlayerService.shared

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
                    } else {
                        Button(action: { onGenerateAudio("summary") }) {
                            Label("Gen Summary", systemImage: "waveform")
                                .font(.caption)
                        }
                    }

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
                    } else {
                        Button(action: { onGenerateAudio("full") }) {
                            Label("Gen Full", systemImage: "waveform")
                                .font(.caption)
                        }
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
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
