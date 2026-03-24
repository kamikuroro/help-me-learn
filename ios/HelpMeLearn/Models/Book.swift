import Foundation

struct Book: Codable, Identifiable {
    let id: Int
    let title: String
    let author: String?
    let filePath: String?
    let totalPages: Int?
    let totalChapters: Int?
    let language: String?
    let status: String
    let errorMessage: String?
    let metadata: [String: AnyCodableValue]?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, author, status, language, metadata
        case filePath = "file_path"
        case totalPages = "total_pages"
        case totalChapters = "total_chapters"
        case errorMessage = "error_message"
        case createdAt = "created_at"
    }

    var isReady: Bool { status == "ready" }
    var isProcessing: Bool { !["ready", "failed"].contains(status) }
}

struct BookDetail: Codable {
    let id: Int
    let title: String
    let author: String?
    let filePath: String
    let totalPages: Int?
    let totalChapters: Int?
    let language: String?
    let status: String
    let errorMessage: String?
    let chapters: [BookChapter]

    enum CodingKeys: String, CodingKey {
        case id, title, author, status, language, chapters
        case filePath = "file_path"
        case totalPages = "total_pages"
        case totalChapters = "total_chapters"
        case errorMessage = "error_message"
    }

    var isReady: Bool { status == "ready" }
}

struct BookChapter: Codable, Identifiable {
    let id: Int
    let chapterIndex: Int
    let title: String?
    let wordCount: Int?
    let language: String?
    let status: String
    let pageStart: Int?
    let pageEnd: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, status, language
        case chapterIndex = "chapter_index"
        case wordCount = "word_count"
        case pageStart = "page_start"
        case pageEnd = "page_end"
    }

    var displayTitle: String {
        title ?? "Chapter \(chapterIndex + 1)"
    }

    var hasContent: Bool { status == "ready" }

    var pageRangeLabel: String? {
        guard let s = pageStart, let e = pageEnd else { return nil }
        return "pp. \(s)\u{2013}\(e)"
    }
}

struct PodcastEpisode: Codable, Identifiable {
    let id: Int
    let chapterId: Int?
    let chapterTitle: String?
    let chapterIndex: Int?
    let mode: String
    let status: String
    let durationS: Double?
    let pageStart: Int?
    let pageEnd: Int?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, mode, status
        case chapterId = "chapter_id"
        case chapterTitle = "chapter_title"
        case chapterIndex = "chapter_index"
        case durationS = "duration_s"
        case pageStart = "page_start"
        case pageEnd = "page_end"
        case createdAt = "created_at"
    }

    var isReady: Bool { status == "ready" }
    var isProcessing: Bool { !["ready", "failed", "pending"].contains(status) }

    var formattedDuration: String {
        guard let d = durationS, d > 0 else { return "" }
        let mins = Int(d) / 60
        let secs = Int(d) % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }

    var modeLabel: String {
        mode == "conversational" ? "Podcast" : "Narration"
    }
}

struct EpisodeDetail: Codable {
    let id: Int
    let bookId: Int
    let chapterId: Int?
    let mode: String
    let script: String?
    let status: String
    let durationS: Double?
    let errorMessage: String?
    let audioPath: String?

    enum CodingKeys: String, CodingKey {
        case id, mode, script, status
        case bookId = "book_id"
        case chapterId = "chapter_id"
        case durationS = "duration_s"
        case errorMessage = "error_message"
        case audioPath = "audio_path"
    }
}

struct GenerateEpisodesResponse: Codable {
    let message: String
    let episodeIds: [Int]
    let mode: String

    enum CodingKeys: String, CodingKey {
        case message, mode
        case episodeIds = "episode_ids"
    }
}

struct CreateBookResponse: Codable {
    let id: Int
    let status: String
    let message: String
}

struct RegenerateResponse: Codable {
    let message: String
    let episodeId: Int

    enum CodingKeys: String, CodingKey {
        case message
        case episodeId = "episode_id"
    }
}

/// Helper for decoding arbitrary JSON values in metadata
enum AnyCodableValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(String.self) { self = .string(v) }
        else if let v = try? container.decode(Int.self) { self = .int(v) }
        else if let v = try? container.decode(Double.self) { self = .double(v) }
        else if let v = try? container.decode(Bool.self) { self = .bool(v) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }
}
