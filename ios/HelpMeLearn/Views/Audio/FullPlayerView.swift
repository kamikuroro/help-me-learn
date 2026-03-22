import SwiftUI

struct FullPlayerView: View {
    @State private var audioPlayer = AudioPlayerService.shared
    @Environment(\.dismiss) private var dismiss

    private let speeds: [Float] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 8) {
                    Text(audioPlayer.currentTitle ?? "Playing")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text(audioPlayer.currentType == "full" ? "Full Article" : "Summary")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { audioPlayer.currentTime },
                            set: { audioPlayer.seek(to: $0) }
                        ),
                        in: 0...max(audioPlayer.duration, 1)
                    )

                    HStack {
                        Text(formatDuration(audioPlayer.currentTime))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(formatDuration(audioPlayer.duration))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                HStack(spacing: 40) {
                    Button(action: { audioPlayer.skip(seconds: -15) }) {
                        Image(systemName: "gobackward.15")
                            .font(.title)
                    }

                    Button(action: { audioPlayer.togglePlayPause() }) {
                        Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 64))
                    }

                    Button(action: { audioPlayer.skip(seconds: 15) }) {
                        Image(systemName: "goforward.15")
                            .font(.title)
                    }
                }

                HStack {
                    Text("Speed")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Picker("Speed", selection: Binding(
                        get: { audioPlayer.playbackRate },
                        set: { audioPlayer.setRate($0) }
                    )) {
                        ForEach(speeds, id: \.self) { speed in
                            Text("\(speed, specifier: "%.2g")x").tag(speed)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.horizontal)

                Spacer()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button(action: {
                        audioPlayer.stop()
                        dismiss()
                    }) {
                        Image(systemName: "stop.circle")
                    }
                }
            }
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }
}
