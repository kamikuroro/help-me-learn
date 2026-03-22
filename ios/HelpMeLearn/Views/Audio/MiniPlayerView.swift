import SwiftUI

struct MiniPlayerView: View {
    @State private var audioPlayer = AudioPlayerService.shared
    @State private var showFullPlayer = false

    var body: some View {
        if audioPlayer.currentSourceId != nil {
            VStack(spacing: 0) {
                GeometryReader { geo in
                    Rectangle()
                        .fill(.blue)
                        .frame(width: audioPlayer.duration > 0
                            ? geo.size.width * (audioPlayer.currentTime / audioPlayer.duration)
                            : 0
                        )
                }
                .frame(height: 2)

                HStack(spacing: 12) {
                    VStack(alignment: .leading) {
                        Text(audioPlayer.currentTitle ?? "Playing")
                            .font(.subheadline)
                            .lineLimit(1)
                        Text(audioPlayer.currentType == "full" ? "Full Article" : "Summary")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(action: { audioPlayer.skip(seconds: -15) }) {
                        Image(systemName: "gobackward.15")
                    }

                    Button(action: { audioPlayer.togglePlayPause() }) {
                        Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                    }

                    Button(action: { audioPlayer.skip(seconds: 15) }) {
                        Image(systemName: "goforward.15")
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
            }
            .onTapGesture { showFullPlayer = true }
            .sheet(isPresented: $showFullPlayer) {
                FullPlayerView()
            }
        }
    }
}
