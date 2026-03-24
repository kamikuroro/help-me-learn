import SwiftUI

struct BookDetailView: View {
    let bookId: Int
    @State private var viewModel: BookDetailViewModel
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var showGenerateSheet = false

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
                        NavigationLink {
                            PDFPreviewView(bookId: bookId)
                        } label: {
                            Label("Preview PDF", systemImage: "doc.richtext")
                        }
                    } header: {
                        Text("Info")
                    }

                    // Generate section
                    if book.isReady {
                        Section {
                            Button {
                                showGenerateSheet = true
                            } label: {
                                Label(
                                    viewModel.isGenerating ? "Generating..." : "Generate Podcast",
                                    systemImage: "waveform"
                                )
                            }
                            .disabled(viewModel.isGenerating)
                        }
                    }

                    // Chapters section
                    if !book.chapters.isEmpty {
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

                    // Page-range episodes (no chapter)
                    let pageRangeEpisodes = viewModel.episodes.filter { $0.chapterId == nil }
                    if !pageRangeEpisodes.isEmpty {
                        Section {
                            ForEach(pageRangeEpisodes) { episode in
                                EpisodeRowView(
                                    episode: episode,
                                    onPlay: {
                                        audioPlayer.playPodcastEpisode(
                                            episodeId: episode.id,
                                            title: "\(book.title) — \(episode.chapterTitle ?? "Custom Range")",
                                            mode: episode.mode
                                        )
                                    },
                                    onRegenerate: {
                                        Task { await viewModel.regenerateEpisode(episode.id) }
                                    }
                                )
                            }
                        } header: {
                            Text("Page Range Episodes")
                        }
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
        .sheet(isPresented: $showGenerateSheet) {
            GeneratePodcastSheet(
                book: viewModel.book!,
                isGenerating: viewModel.isGenerating,
                onGenerate: { mode, chapterIds, pgStart, pgEnd in
                    Task {
                        if let pgStart, let pgEnd {
                            await viewModel.generateEpisodes(mode: mode, pageStart: pgStart, pageEnd: pgEnd)
                        } else if !chapterIds.isEmpty {
                            await viewModel.generateEpisodes(mode: mode, chapters: Array(chapterIds))
                        } else {
                            await viewModel.generateEpisodes(mode: mode)
                        }
                        showGenerateSheet = false
                    }
                }
            )
        }
        .task { await viewModel.load() }
    }
}

struct GeneratePodcastSheet: View {
    let book: BookDetail
    let isGenerating: Bool
    let onGenerate: (String, Set<Int>, Int?, Int?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "conversational"
    @State private var usePageRange = false
    @State private var selectedChapterIds: Set<Int> = []
    @State private var pageStart = ""
    @State private var pageEnd = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Mode") {
                    Picker("Style", selection: $mode) {
                        Text("Conversational").tag("conversational")
                        Text("Narration").tag("verbatim")
                    }
                    .pickerStyle(.segmented)
                }

                Section("Source") {
                    Picker("Generate from", selection: $usePageRange) {
                        Text("Chapters").tag(false)
                        Text("Page Range").tag(true)
                    }
                    .pickerStyle(.segmented)
                }

                if usePageRange {
                    Section("Page Range") {
                        HStack {
                            TextField("Start", text: $pageStart)
                                .keyboardType(.numberPad)
                            Text("to")
                                .foregroundStyle(.secondary)
                            TextField("End", text: $pageEnd)
                                .keyboardType(.numberPad)
                        }
                        if let total = book.totalPages {
                            Text("Book has \(total) pages")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Section("Select Chapters") {
                        if book.chapters.isEmpty {
                            Text("No chapters detected in this PDF. Use page range instead.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Button(selectedChapterIds.count == book.chapters.count ? "Deselect All" : "Select All") {
                                if selectedChapterIds.count == book.chapters.count {
                                    selectedChapterIds.removeAll()
                                } else {
                                    selectedChapterIds = Set(book.chapters.map { $0.id })
                                }
                            }
                            .font(.caption)

                            ForEach(book.chapters) { chapter in
                                Button {
                                    if selectedChapterIds.contains(chapter.id) {
                                        selectedChapterIds.remove(chapter.id)
                                    } else {
                                        selectedChapterIds.insert(chapter.id)
                                    }
                                } label: {
                                    HStack {
                                        Image(systemName: selectedChapterIds.contains(chapter.id) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(selectedChapterIds.contains(chapter.id) ? .blue : .secondary)
                                        VStack(alignment: .leading) {
                                            Text(chapter.displayTitle)
                                                .foregroundStyle(.primary)
                                            if let range = chapter.pageRangeLabel {
                                                Text(range)
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Generate Podcast")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isGenerating {
                        ProgressView()
                    } else {
                        Button("Generate") {
                            if usePageRange {
                                let start = Int(pageStart)
                                let end = Int(pageEnd)
                                onGenerate(mode, [], start, end)
                            } else {
                                onGenerate(mode, selectedChapterIds, nil, nil)
                            }
                        }
                        .disabled(!canGenerate)
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private var canGenerate: Bool {
        if usePageRange {
            guard let s = Int(pageStart), let e = Int(pageEnd), s > 0, e >= s else { return false }
            return true
        } else {
            return !selectedChapterIds.isEmpty || book.chapters.isEmpty
        }
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
                if let range = chapter.pageRangeLabel {
                    Text(range)
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
