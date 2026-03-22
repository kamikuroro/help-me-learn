import Foundation

struct Conversation: Codable, Identifiable {
    let id: Int
    let sourceId: Int?
    let title: String?
    let type: String
    let createdAt: String
    let updatedAt: String
    let messageCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, type
        case sourceId = "source_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case messageCount = "message_count"
    }

    var isPerArticle: Bool { type == "per_article" }
}

struct Message: Codable, Identifiable {
    let id: Int
    let role: String
    let content: String
    let audioPath: String?
    let citedSourceIds: [Int]?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, role, content
        case audioPath = "audio_path"
        case citedSourceIds = "cited_source_ids"
        case createdAt = "created_at"
    }

    var isUser: Bool { role == "user" }
}

struct ConversationDetail: Codable {
    let id: Int
    let sourceId: Int?
    let title: String?
    let type: String
    let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case id, title, type, messages
        case sourceId = "source_id"
    }
}

struct ChatRequest: Codable {
    let message: String
    let sourceId: Int?
    let conversationId: Int?
    let tts: Bool?

    enum CodingKeys: String, CodingKey {
        case message
        case sourceId = "source_id"
        case conversationId = "conversation_id"
        case tts
    }
}

struct ChatResponse: Codable {
    let messageId: Int
    let conversationId: Int
    let content: String
    let audioUrl: String?
    let sourcesReferenced: [SourceRef]

    enum CodingKeys: String, CodingKey {
        case content
        case messageId = "message_id"
        case conversationId = "conversation_id"
        case audioUrl = "audio_url"
        case sourcesReferenced = "sources_referenced"
    }
}

struct SourceRef: Codable {
    let id: Int
    let title: String
    let url: String
}
