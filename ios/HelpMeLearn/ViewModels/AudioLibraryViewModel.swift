import Foundation

struct AudioItem: Identifiable {
    let id: String // "sourceId-type" or "episode-episodeId"
    let sourceId: Int
    let type: String // "summary", "full", "podcast", "narration"
    let title: String
    let summary: String?
    let url: String
    let durationSeconds: Double?
    let episodeId: Int? // non-nil for podcast episodes

    init(id: String, sourceId: Int, type: String, title: String, summary: String?, url: String, durationSeconds: Double?, episodeId: Int? = nil) {
        self.id = id
        self.sourceId = sourceId
        self.type = type
        self.title = title
        self.summary = summary
        self.url = url
        self.durationSeconds = durationSeconds
        self.episodeId = episodeId
    }

    var isPodcast: Bool { episodeId != nil }

    var formattedDuration: String {
        guard let d = durationSeconds, d > 0 else { return "" }
        let mins = Int(d) / 60
        let secs = Int(d) % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }

    var shareText: String {
        var text = title
        if let summary {
            let snippet = summary.count > 280 ? String(summary.prefix(280)) + "..." : summary
            text += "\n\n\(snippet)"
        }
        text += "\n\n\(url)"
        return text
    }
}

@Observable
final class AudioLibraryViewModel {
    var items: [AudioItem] = []
    var isLoading = false
    var error: String?
    var downloadingItemId: String?

    func loadAudio() async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.listSources(limit: 100)
            var audioItems: [AudioItem] = []
            for source in response.data where !source.url.hasPrefix("book://") {
                if source.hasSummaryAudio {
                    audioItems.append(AudioItem(
                        id: "\(source.id)-summary",
                        sourceId: source.id,
                        type: "summary",
                        title: source.title ?? "Untitled",
                        summary: source.summary,
                        url: source.url,
                        durationSeconds: source.audioSummaryDurationS
                    ))
                }
                if source.hasFullAudio {
                    audioItems.append(AudioItem(
                        id: "\(source.id)-full",
                        sourceId: source.id,
                        type: "full",
                        title: source.title ?? "Untitled",
                        summary: source.summary,
                        url: source.url,
                        durationSeconds: source.audioFullDurationS
                    ))
                }
            }
            // Also load podcast episodes from all books
            let books = try await APIClient.shared.listBooks()
            for book in books where book.isReady {
                let episodes = try await APIClient.shared.listEpisodes(bookId: book.id)
                for episode in episodes where episode.isReady {
                    let chapterTitle = episode.chapterTitle ?? "Chapter \(episode.chapterIndex + 1)"
                    audioItems.append(AudioItem(
                        id: "episode-\(episode.id)",
                        sourceId: book.id,
                        type: episode.mode == "conversational" ? "podcast" : "narration",
                        title: "\(book.title) — \(chapterTitle)",
                        summary: nil,
                        url: "",
                        durationSeconds: episode.durationS,
                        episodeId: episode.id
                    ))
                }
            }

            items = audioItems
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func deleteItem(_ item: AudioItem) async {
        do {
            if let episodeId = item.episodeId {
                try await APIClient.shared.deleteEpisode(id: episodeId)
            } else {
                try await APIClient.shared.deleteSource(id: item.sourceId)
            }
            items.removeAll { $0.id == item.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func downloadForSharing(item: AudioItem) async -> URL? {
        downloadingItemId = item.id
        defer { downloadingItemId = nil }
        do {
            return try await APIClient.shared.downloadAudio(
                sourceId: item.sourceId,
                type: item.type,
                title: item.title
            )
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }
}
