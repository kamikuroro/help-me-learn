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
                                audioPlayer.playAudio(
                                    sourceId: item.sourceId,
                                    type: item.type,
                                    title: item.title
                                )
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
                Text(item.type.capitalized)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(item.type == "summary" ? Color.blue.opacity(0.2) : Color.purple.opacity(0.2))
                    .foregroundStyle(item.type == "summary" ? .blue : .purple)
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
