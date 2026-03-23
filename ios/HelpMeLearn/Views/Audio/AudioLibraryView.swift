import SwiftUI
import UIKit

struct AudioLibraryView: View {
    @State private var viewModel = AudioLibraryViewModel()
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var shareItem: ShareableAudio?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.items.isEmpty {
                    ProgressView("Loading audio...")
                } else if viewModel.items.isEmpty {
                    ContentUnavailableView(
                        "No Audio Yet",
                        systemImage: "headphones",
                        description: Text("Generate audio from your Feed to see it here")
                    )
                } else {
                    List(viewModel.items) { item in
                        AudioItemRow(
                            item: item,
                            isDownloading: viewModel.downloadingItemId == item.id,
                            onPlay: {
                                if let episodeId = item.episodeId {
                                    audioPlayer.playPodcastEpisode(
                                        episodeId: episodeId,
                                        title: item.title,
                                        mode: item.type == "podcast" ? "conversational" : "verbatim"
                                    )
                                } else {
                                    audioPlayer.playAudio(
                                        sourceId: item.sourceId,
                                        type: item.type,
                                        title: item.title
                                    )
                                }
                            },
                            onShare: {
                                Task {
                                    if let fileURL = await viewModel.downloadForSharing(item: item) {
                                        shareItem = ShareableAudio(fileURL: fileURL, text: item.shareText)
                                    }
                                }
                            }
                        )
                    }
                    .refreshable { await viewModel.loadAudio() }
                }
            }
            .navigationTitle("Audio")
            .alert("Error", isPresented: .init(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.error = nil } }
            )) {
                Button("OK") { viewModel.error = nil }
            } message: {
                Text(viewModel.error ?? "")
            }
            .sheet(item: $shareItem) { item in
                ShareSheet(items: [item.fileURL, item.text])
            }
            .task { await viewModel.loadAudio() }
        }
    }
}

struct AudioItemRow: View {
    let item: AudioItem
    let isDownloading: Bool
    let onPlay: () -> Void
    let onShare: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                Text(item.type == "podcast" ? "Podcast" : item.type == "narration" ? "Narration" : item.type.capitalized)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(typeBadgeColor(item.type).opacity(0.2))
                    .foregroundStyle(typeBadgeColor(item.type))
                    .clipShape(Capsule())
            }

            HStack(spacing: 16) {
                if !item.formattedDuration.isEmpty {
                    Label(item.formattedDuration, systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button(action: onPlay) {
                    Label("Play", systemImage: "play.circle.fill")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                if isDownloading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button(action: onShare) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func typeBadgeColor(_ type: String) -> Color {
        switch type {
        case "summary": return .blue
        case "full": return .purple
        case "podcast": return .orange
        case "narration": return .teal
        default: return .gray
        }
    }
}

// ShareSheet wrapper for UIActivityViewController
struct ShareableAudio: Identifiable {
    let id = UUID()
    let fileURL: URL
    let text: String
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
