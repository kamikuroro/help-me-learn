import Foundation

struct Source: Codable, Identifiable {
    let id: Int
    let url: String
    let title: String?
    let summary: String?
    let category: String?
    let tags: [String]
    let status: String
    let errorMessage: String?
    let wordCount: Int?
    let audioFullPath: String?
    let audioFullDurationS: Double?
    let audioSummaryPath: String?
    let audioSummaryDurationS: Double?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, url, title, summary, category, tags, status
        case errorMessage = "error_message"
        case wordCount = "word_count"
        case audioFullPath = "audio_full_path"
        case audioFullDurationS = "audio_full_duration_s"
        case audioSummaryPath = "audio_summary_path"
        case audioSummaryDurationS = "audio_summary_duration_s"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var hasFullAudio: Bool { audioFullPath != nil }
    var hasSummaryAudio: Bool { audioSummaryPath != nil }
    var isReady: Bool { status == "ready" }
    var isProcessing: Bool { !["ready", "failed"].contains(status) }
}

struct SourceDetail: Codable {
    let id: Int
    let url: String
    let title: String?
    let rawContent: String?
    let summary: String?
    let category: String?
    let tags: [String]
    let status: String

    enum CodingKeys: String, CodingKey {
        case id, url, title, summary, category, tags, status
        case rawContent = "raw_content"
    }
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let total: Int
    let offset: Int
    let limit: Int
}

struct IngestResponse: Codable {
    let id: Int
    let status: String
    let message: String
}

struct SearchResult: Codable {
    let sourceId: Int
    let title: String
    let url: String
    let excerpt: String
    let relevance: Double
    let category: String?

    enum CodingKeys: String, CodingKey {
        case sourceId = "source_id"
        case title, url, excerpt, relevance, category
    }
}

struct SearchResponse: Codable {
    let query: String
    let results: [SearchResult]
    let total: Int
}
