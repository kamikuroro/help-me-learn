import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case serverError(Int, String)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .unauthorized: return "Invalid auth token"
        case .serverError(let code, let msg): return "Server error (\(code)): \(msg)"
        case .networkError(let err): return "Network error: \(err.localizedDescription)"
        case .decodingError(let err): return "Decoding error: \(err.localizedDescription)"
        }
    }
}

@Observable
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private var baseURL: String { SettingsService.shared.serverURL }
    private var token: String { SettingsService.shared.authToken }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 1200
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    func listSources(limit: Int = 20, offset: Int = 0, category: String? = nil) async throws -> PaginatedResponse<Source> {
        var params = "limit=\(limit)&offset=\(offset)"
        if let category { params += "&category=\(category)" }
        return try await get("/api/sources?\(params)")
    }

    func getSource(id: Int) async throws -> SourceDetail {
        return try await get("/api/sources/\(id)")
    }

    func deleteSource(id: Int) async throws {
        let _: EmptyResponse = try await delete("/api/sources/\(id)")
    }

    func ingestURL(_ url: String, tags: [String]? = nil, content: String? = nil, title: String? = nil) async throws -> IngestResponse {
        var body: [String: Any] = ["url": url]
        if let tags { body["tags"] = tags }
        if let content { body["content"] = content }
        if let title { body["title"] = title }
        return try await post("/api/ingest", body: body)
    }

    func getIngestionStatus(id: Int) async throws -> IngestionStatus {
        return try await get("/api/ingest/\(id)/status")
    }

    func search(query: String, limit: Int = 10) async throws -> SearchResponse {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return try await get("/api/search?q=\(encoded)&limit=\(limit)")
    }

    func sendMessage(_ message: String, sourceId: Int? = nil, conversationId: Int? = nil, tts: Bool = false) async throws -> ChatResponse {
        var body: [String: Any] = ["message": message]
        if let sourceId { body["source_id"] = sourceId }
        if let conversationId { body["conversation_id"] = conversationId }
        if tts { body["tts"] = true }
        return try await post("/api/chat", body: body, timeout: 1200)
    }

    func listConversations(limit: Int = 20, offset: Int = 0) async throws -> PaginatedResponse<Conversation> {
        return try await get("/api/conversations?limit=\(limit)&offset=\(offset)")
    }

    func getConversation(id: Int) async throws -> ConversationDetail {
        return try await get("/api/conversations/\(id)")
    }

    func generateAudio(sourceId: Int, type: String) async throws {
        let _: GenerateAudioResponse = try await post("/api/audio/generate/\(sourceId)", body: ["type": type])
    }

    func getAudioQuota() async throws -> AudioQuota {
        return try await get("/api/audio/quota")
    }

    /// Download audio MP3 to a temp file and return the local file URL.
    func downloadAudio(sourceId: Int, type: String, title: String?) async throws -> URL {
        guard var request = audioRequest(sourceId: sourceId, type: type) else {
            throw APIError.invalidURL
        }
        request.timeoutInterval = 120

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError((response as? HTTPURLResponse)?.statusCode ?? 0, "Download failed")
        }

        let filename = "\(title ?? "audio")-\(type).mp3"
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: tempURL)
        return tempURL
    }

    func audioURL(sourceId: Int, type: String) -> URL? {
        URL(string: "\(baseURL)/api/audio/\(type)/\(sourceId)")
    }

    func audioRequest(sourceId: Int, type: String) -> URLRequest? {
        guard let url = audioURL(sourceId: sourceId, type: type) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    // MARK: - Books & Podcast

    func listBooks() async throws -> [Book] {
        return try await get("/api/books")
    }

    func getBook(id: Int) async throws -> BookDetail {
        return try await get("/api/books/\(id)")
    }

    func createBook(filePath: String, pageRange: String? = nil, title: String? = nil, author: String? = nil) async throws -> CreateBookResponse {
        var body: [String: Any] = ["file_path": filePath]
        if let pageRange { body["page_range"] = pageRange }
        if let title { body["title"] = title }
        if let author { body["author"] = author }
        return try await post("/api/books", body: body)
    }

    func generateEpisodes(bookId: Int, mode: String, chapters: [Int]? = nil) async throws -> GenerateEpisodesResponse {
        var body: [String: Any] = ["mode": mode]
        if let chapters { body["chapters"] = chapters }
        return try await post("/api/books/\(bookId)/episodes", body: body)
    }

    func listEpisodes(bookId: Int) async throws -> [PodcastEpisode] {
        return try await get("/api/books/\(bookId)/episodes")
    }

    func getEpisode(id: Int) async throws -> EpisodeDetail {
        return try await get("/api/podcast/episodes/\(id)")
    }

    func regenerateEpisode(id: Int, regenerateScript: Bool = true) async throws -> RegenerateResponse {
        return try await post("/api/podcast/episodes/\(id)/regenerate", body: ["regenerate_script": regenerateScript])
    }

    func podcastAudioURL(episodeId: Int) -> URL? {
        URL(string: "\(baseURL)/api/podcast/episodes/\(episodeId)/audio")
    }

    func podcastAudioRequest(episodeId: Int) -> URLRequest? {
        guard let url = podcastAudioURL(episodeId: episodeId) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    func healthCheck() async throws -> HealthResponse {
        guard let url = URL(string: "\(baseURL)/api/health") else { throw APIError.invalidURL }
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(HealthResponse.self, from: data)
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path, method: "GET")
        return try await execute(request)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any], timeout: TimeInterval? = nil) async throws -> T {
        var request = try makeRequest(path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        if let timeout { request.timeoutInterval = timeout }
        return try await execute(request)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let request = try makeRequest(path, method: "DELETE")
        return try await execute(request)
    }

    private func makeRequest(_ path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL)\(path)") else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0, "Invalid response")
        }

        if httpResponse.statusCode == 204 {
            if let empty = EmptyResponse() as? T { return empty }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
                throw APIError.unauthorized
            }
            throw APIError.serverError(httpResponse.statusCode, body)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

struct EmptyResponse: Codable {
    init() {}
}

struct IngestionStatus: Codable {
    let id: Int
    let status: String
    let errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case errorMessage = "error_message"
    }
}

struct GenerateAudioResponse: Codable {
    let message: String
    let sourceId: Int
    let type: String

    enum CodingKeys: String, CodingKey {
        case message, type
        case sourceId = "source_id"
    }
}

struct HealthResponse: Codable {
    let status: String
    let db: String
    let timestamp: String
}

struct AudioQuota: Codable {
    let characterLimit: Int
    let characterCount: Int
    let charactersRemaining: Int
    let tier: String?
    let provider: String

    enum CodingKeys: String, CodingKey {
        case provider, tier
        case characterLimit = "character_limit"
        case characterCount = "character_count"
        case charactersRemaining = "characters_remaining"
    }
}
