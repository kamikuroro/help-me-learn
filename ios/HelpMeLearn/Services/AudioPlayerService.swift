import Foundation
import AVFoundation
import MediaPlayer

@Observable
final class AudioPlayerService {
    static let shared = AudioPlayerService()

    private var player: AVPlayer?
    private var timeObserver: Any?

    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    var currentSourceId: Int?
    var currentType: String?
    var currentTitle: String?
    var playbackRate: Float = 1.0

    private init() {
        setupAudioSession()
        setupRemoteControls()
    }

    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            print("Audio session setup failed: \(error)")
        }
    }

    private func setupRemoteControls() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }

        center.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }

        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: 15)
            return .success
        }

        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: -15)
            return .success
        }

        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(to: event.positionTime)
            return .success
        }

        center.changePlaybackRateCommand.supportedPlaybackRates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]
        center.changePlaybackRateCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackRateCommandEvent else { return .commandFailed }
            self?.setRate(event.playbackRate)
            return .success
        }
    }

    func playAudio(sourceId: Int, type: String, title: String) {
        guard let request = APIClient.shared.audioRequest(sourceId: sourceId, type: type) else { return }

        let headers = request.allHTTPHeaderFields ?? [:]
        let asset = AVURLAsset(url: request.url!, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)

        if let player {
            player.replaceCurrentItem(with: item)
        } else {
            player = AVPlayer(playerItem: item)
        }

        currentSourceId = sourceId
        currentType = type
        currentTitle = title

        setupTimeObserver()
        player?.rate = playbackRate
        isPlaying = true

        updateNowPlayingInfo()
    }

    func playPodcastEpisode(episodeId: Int, title: String, mode: String) {
        guard let request = APIClient.shared.podcastAudioRequest(episodeId: episodeId) else { return }

        let headers = request.allHTTPHeaderFields ?? [:]
        let asset = AVURLAsset(url: request.url!, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)

        if let player {
            player.replaceCurrentItem(with: item)
        } else {
            player = AVPlayer(playerItem: item)
        }

        currentSourceId = episodeId
        currentType = mode == "conversational" ? "podcast" : "narration"
        currentTitle = title

        setupTimeObserver()
        player?.rate = playbackRate
        isPlaying = true
        updateNowPlayingInfo()
    }

    func playFromURL(_ urlString: String, id: Int, type: String, title: String) {
        let baseURL = SettingsService.shared.serverURL
        let token = SettingsService.shared.authToken
        guard let url = URL(string: "\(baseURL)\(urlString)") else { return }

        let headers = ["Authorization": "Bearer \(token)"]
        let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let item = AVPlayerItem(asset: asset)

        if let player {
            player.replaceCurrentItem(with: item)
        } else {
            player = AVPlayer(playerItem: item)
        }

        currentSourceId = id
        currentType = type
        currentTitle = title

        setupTimeObserver()
        player?.rate = playbackRate
        isPlaying = true
        updateNowPlayingInfo()
    }

    func play() {
        player?.rate = playbackRate
        isPlaying = true
        updateNowPlayingInfo()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    func skip(seconds: Double) {
        guard let player else { return }
        let target = player.currentTime().seconds + seconds
        seek(to: max(0, min(target, duration)))
    }

    func seek(to time: Double) {
        player?.seek(to: CMTime(seconds: time, preferredTimescale: 600))
        currentTime = time
        updateNowPlayingInfo()
    }

    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            player?.rate = rate
        }
        SettingsService.shared.playbackSpeed = rate
        updateNowPlayingInfo()
    }

    func stop() {
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        isPlaying = false
        currentTime = 0
        duration = 0
        currentSourceId = nil
        currentType = nil
        currentTitle = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func setupTimeObserver() {
        if let existing = timeObserver {
            player?.removeTimeObserver(existing)
        }

        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.currentTime = time.seconds
            if let dur = self.player?.currentItem?.duration.seconds, dur.isFinite {
                self.duration = dur
            }
        }
    }

    private func updateNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle ?? "Help Me Learn",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? playbackRate : 0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPMediaItemPropertyPlaybackDuration: duration,
        ]
        if let type = currentType {
            switch type {
            case "full": info[MPMediaItemPropertyArtist] = "Full Article"
            case "podcast": info[MPMediaItemPropertyArtist] = "Podcast"
            case "narration": info[MPMediaItemPropertyArtist] = "Narration"
            default: info[MPMediaItemPropertyArtist] = "Summary"
            }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
