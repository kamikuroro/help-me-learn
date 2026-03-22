import SwiftUI
import UniformTypeIdentifiers

struct ShareView: View {
    let itemProvider: NSItemProvider
    let onDone: () -> Void

    @State private var url: String = ""
    @State private var status: ShareStatus = .loading
    @State private var errorMessage: String?

    enum ShareStatus {
        case loading, ready, sending, success, error
    }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "square.and.arrow.down")
                .font(.largeTitle)
                .foregroundStyle(.blue)

            switch status {
            case .loading:
                ProgressView("Extracting URL...")
            case .ready:
                Text("Add to Knowledge Base")
                    .font(.headline)
                Text(url)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Button("Add") { sendURL() }
                    .buttonStyle(.borderedProminent)
                Button("Cancel", action: onDone)
                    .foregroundStyle(.secondary)
            case .sending:
                ProgressView("Sending...")
            case .success:
                Image(systemName: "checkmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.green)
                Text("Added!")
                    .font(.headline)
            case .error:
                Image(systemName: "xmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.red)
                Text(errorMessage ?? "Failed to add URL")
                    .font(.subheadline)
                Button("Close", action: onDone)
            }
        }
        .padding()
        .task { await extractURL() }
    }

    private func extractURL() async {
        let urlType = UTType.url.identifier

        guard itemProvider.hasItemConformingToTypeIdentifier(urlType) else {
            status = .error
            errorMessage = "No URL found"
            return
        }

        do {
            let item = try await itemProvider.loadItem(forTypeIdentifier: urlType)
            if let url = item as? URL {
                self.url = url.absoluteString
                status = .ready
            } else if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                self.url = url.absoluteString
                status = .ready
            } else {
                status = .error
                errorMessage = "Could not extract URL"
            }
        } catch {
            status = .error
            errorMessage = error.localizedDescription
        }
    }

    private func sendURL() {
        status = .sending

        let settings = SettingsService.shared
        guard settings.isConfigured else {
            status = .error
            errorMessage = "Please configure server URL and token in Settings"
            return
        }

        Task {
            do {
                _ = try await APIClient.shared.ingestURL(url)
                status = .success
                try? await Task.sleep(for: .seconds(1.5))
                onDone()
            } catch {
                status = .error
                errorMessage = error.localizedDescription
            }
        }
    }
}
