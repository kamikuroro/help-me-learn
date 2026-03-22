import SwiftUI
import UIKit

struct MessageBubbleView: View {
    let message: Message
    @State private var audioPlayer = AudioPlayerService.shared

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 60) }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .textSelection(.enabled)
                    .padding(12)
                    .background(message.isUser ? Color.blue : Color(.systemGray5))
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .contextMenu {
                        Button(action: {
                            UIPasteboard.general.string = message.content
                        }) {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                    }

                HStack(spacing: 8) {
                    if !message.isUser, let audioPath = message.audioPath {
                        Button(action: {
                            if isPlayingThis {
                                audioPlayer.togglePlayPause()
                            } else {
                                audioPlayer.playFromURL(audioPath, id: message.id, type: "message", title: "Chat Response")
                            }
                        }) {
                            Image(systemName: isPlayingThis ? "pause.circle.fill" : "play.circle.fill")
                                .font(.title3)
                                .foregroundStyle(.blue)
                        }
                    }

                    Text(formatTime(message.createdAt))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
    }

    private var isPlayingThis: Bool {
        audioPlayer.currentSourceId == message.id && audioPlayer.currentType == "message"
    }

    private func formatTime(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else { return "" }
        let display = DateFormatter()
        display.timeStyle = .short
        return display.string(from: date)
    }
}
