import Foundation

@Observable
final class ChatViewModel {
    var messages: [Message] = []
    var isLoading = false
    var error: String?
    var conversationId: Int?
    var sourceId: Int?

    var chatType: String {
        sourceId != nil ? "per_article" : "cross_kb"
    }

    func sendMessage(_ text: String) async {
        isLoading = true
        error = nil

        let userMsg = Message(
            id: -(messages.count + 1),
            role: "user",
            content: text,
            audioPath: nil,
            citedSourceIds: nil,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        messages.append(userMsg)

        do {
            let response = try await APIClient.shared.sendMessage(
                text,
                sourceId: sourceId,
                conversationId: conversationId,
                tts: SettingsService.shared.chatAudioEnabled
            )
            conversationId = response.conversationId

            let assistantMsg = Message(
                id: response.messageId,
                role: "assistant",
                content: response.content,
                audioPath: response.audioUrl,
                citedSourceIds: response.sourcesReferenced.map { $0.id },
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
            messages.append(assistantMsg)
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadConversation(id: Int) async {
        do {
            let detail = try await APIClient.shared.getConversation(id: id)
            messages = detail.messages
            conversationId = detail.id
            sourceId = detail.sourceId
        } catch {
            self.error = error.localizedDescription
        }
    }

    func deleteConversation() async {
        guard let id = conversationId else { return }
        do {
            try await APIClient.shared.deleteConversation(id: id)
            reset()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func reset() {
        messages = []
        conversationId = nil
        error = nil
    }
}
