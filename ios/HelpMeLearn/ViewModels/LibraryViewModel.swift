import Foundation

@Observable
final class LibraryViewModel {
    var sources: [Source] = []
    var searchResults: [SearchResult] = []
    var isLoading = false
    var error: String?
    var searchQuery = ""
    var selectedCategory: String?

    let categories = [
        "ai_agents", "prompt_engineering", "ml_ops", "software_engineering",
        "web_development", "data_science", "devtools", "career", "product", "design", "other"
    ]

    func loadSources() async {
        isLoading = true
        do {
            let response = try await APIClient.shared.listSources(
                limit: 100,
                category: selectedCategory
            )
            sources = response.data.filter { $0.isReady && !$0.url.hasPrefix("book://") }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func deleteSource(_ source: Source) async {
        do {
            try await APIClient.shared.deleteSource(id: source.id)
            sources.removeAll { $0.id == source.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func search() async {
        guard !searchQuery.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            return
        }
        isLoading = true
        do {
            let response = try await APIClient.shared.search(query: searchQuery)
            searchResults = response.results
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
