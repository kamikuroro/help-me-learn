import Foundation

@Observable
final class BooksViewModel {
    var books: [Book] = []
    var isLoading = false
    var error: String?

    func loadBooks() async {
        isLoading = true
        error = nil
        do {
            books = try await APIClient.shared.listBooks()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func deleteBook(_ book: Book) async {
        do {
            try await APIClient.shared.deleteBook(id: book.id)
            books.removeAll { $0.id == book.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

@Observable
final class BookDetailViewModel {
    let bookId: Int

    var book: BookDetail?
    var episodes: [PodcastEpisode] = []
    var isLoading = false
    var isGenerating = false
    var error: String?

    init(bookId: Int) {
        self.bookId = bookId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            async let bookReq = APIClient.shared.getBook(id: bookId)
            async let episodesReq = APIClient.shared.listEpisodes(bookId: bookId)
            book = try await bookReq
            episodes = try await episodesReq
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func generateEpisodes(mode: String, chapters: [Int]? = nil) async {
        isGenerating = true
        error = nil
        do {
            _ = try await APIClient.shared.generateEpisodes(bookId: bookId, mode: mode, chapters: chapters)
            // Reload episodes to reflect new pending ones
            episodes = try await APIClient.shared.listEpisodes(bookId: bookId)
        } catch {
            self.error = error.localizedDescription
        }
        isGenerating = false
    }

    func regenerateEpisode(_ episodeId: Int) async {
        do {
            _ = try await APIClient.shared.regenerateEpisode(id: episodeId)
            episodes = try await APIClient.shared.listEpisodes(bookId: bookId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func episodesForChapter(_ chapterId: Int) -> [PodcastEpisode] {
        episodes.filter { $0.chapterId == chapterId }
    }
}
