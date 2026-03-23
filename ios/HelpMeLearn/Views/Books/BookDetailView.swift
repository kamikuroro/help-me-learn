import SwiftUI

struct BookDetailView: View {
    let bookId: Int
    @State private var viewModel: BookDetailViewModel
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var showModeSheet = false

    init(bookId: Int) {
        self.bookId = bookId
        self._viewModel = State(initialValue: BookDetailViewModel(bookId: bookId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.book == nil {
                ProgressView("Loading book...")
            } else if let book = viewModel.book {
                List {
                    // Book info section
                    Section {
                        if let author = book.author {
                            LabeledContent("Author", value: author)
                        }
                        if let pages = book.totalPages {
                            LabeledContent("Pages", value: "\(pages)")
                        }
                        if let lang = book.language {
                            LabeledContent("Language", value: lang == "zh" ? "Chinese" : "English")
                        }
                        LabeledContent("Status") {
                            StatusBadge(status: book.status)
                        }
                    } header: {
                        Text("Info")
                    }

                    // Generate episodes section
                    if book.isReady {
                        Section {
                            Button {
                                showModeSheet = true
                            } label: {
                                Label(
                                    viewModel.isGenerating ? "Generating..." : "Generate Podcast Episodes",
                                    systemImage: "waveform"
                                )
                            }
                            .disabled(viewModel.isGenerating)
                        }
                    }

                    // Chapters section
                    Section {
                        ForEach(book.chapters) { chapter in
                            ChapterRowView(
                                chapter: chapter,
                                episodes: viewModel.episodesForChapter(chapter.id),
                                onPlay: { episode in
                                    audioPlayer.playPodcastEpisode(
                                        episodeId: episode.id,
                                        title: "\(book.title) — \(chapter.displayTitle)",
                                        mode: episode.mode
                                    )
                                },
                                onRegenerate: { episode in
                                    Task { await viewModel.regenerateEpisode(episode.id) }
                                }
                            )
                        }
                    } header: {
                        Text("Chapters (\(book.chapters.count))")
                    }
                }
                .refreshable { await viewModel.load() }
            }
        }
        .navigationTitle(viewModel.book?.title ?? "Book")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Error", isPresented: .init(
            get: { viewModel.error != nil },
            set: { if !$0 { viewModel.error = nil } }
        )) {
            Button("OK") { viewModel.error = nil }
        } message: {
            Text(viewModel.error ?? "")
        }
        .confirmationDialog("Generate Episodes", isPresented: $showModeSheet) {
            Button("Conversational (Two Hosts)") {
                Task { await viewModel.generateEpisodes(mode: "conversational") }
            }
            Button("Verbatim Narration") {
                Task { await viewModel.generateEpisodes(mode: "verbatim") }
            }
            Button("Both Modes") {
                Task {
                    await viewModel.generateEpisodes(mode: "conversational")
                    await viewModel.generateEpisodes(mode: "verbatim")
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the podcast style for all chapters")
        }
        .task { await viewModel.load() }
    }
}

struct ChapterRowView: View {
    let chapter: BookChapter
    let episodes: [PodcastEpisode]
    let onPlay: (PodcastEpisode) -> Void
    let onRegenerate: (PodcastEpisode) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(chapter.displayTitle)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                if let words = chapter.wordCount {
                    Text("\(words) words")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if episodes.isEmpty {
                Text("No episodes generated")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(episodes) { episode in
                    EpisodeRowView(
                        episode: episode,
                        onPlay: { onPlay(episode) },
                        onRegenerate: { onRegenerate(episode) }
                    )
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct EpisodeRowView: View {
    let episode: PodcastEpisode
    let onPlay: () -> Void
    let onRegenerate: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(episode.modeLabel)
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(episode.mode == "conversational" ? Color.purple.opacity(0.2) : Color.blue.opacity(0.2))
                .foregroundStyle(episode.mode == "conversational" ? .purple : .blue)
                .clipShape(Capsule())

            if episode.isReady {
                if !episode.formattedDuration.isEmpty {
                    Label(episode.formattedDuration, systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button(action: onPlay) {
                    Label("Play", systemImage: "play.circle.fill")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)

                Menu {
                    Button("Regenerate", systemImage: "arrow.clockwise", action: onRegenerate)
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.caption)
                }
            } else if episode.status == "failed" {
                Text("Failed")
                    .font(.caption)
                    .foregroundStyle(.red)
                Spacer()
                Button("Retry", systemImage: "arrow.clockwise", action: onRegenerate)
                    .font(.caption)
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
            } else {
                Spacer()
                StatusBadge(status: episode.status)
                ProgressView()
                    .controlSize(.small)
            }
        }
    }
}
