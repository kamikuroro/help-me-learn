import Foundation

struct AudioItem: Identifiable {
    let id: String // "sourceId-type"
    let sourceId: Int
    let type: String // "summary" or "full"
    let title: String
    let summary: String?
    let url: String
    let durationSeconds: Double?

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
            for source in response.data {
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
            items = audioItems
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
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
