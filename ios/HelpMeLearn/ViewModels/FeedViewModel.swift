import Foundation

@Observable
final class FeedViewModel {
    var sources: [Source] = []
    var isLoading = false
    var error: String?
    private var total = 0

    func loadSources() async {
        isLoading = true
        error = nil
        do {
            let response = try await APIClient.shared.listSources()
            sources = response.data.filter { !$0.url.hasPrefix("book://") }
            total = response.total
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func refresh() async {
        await loadSources()
    }

    func deleteSource(_ source: Source) async {
        do {
            try await APIClient.shared.deleteSource(id: source.id)
            sources.removeAll { $0.id == source.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func generateAudio(sourceId: Int, type: String, mode: String = "narration") async {
        do {
            try await APIClient.shared.generateAudio(sourceId: sourceId, type: type, mode: mode)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func ingestURL(_ url: String, content: String? = nil, title: String? = nil) async {
        do {
            _ = try await APIClient.shared.ingestURL(url, content: content, title: title)
            await loadSources()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
