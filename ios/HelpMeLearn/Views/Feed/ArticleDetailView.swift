import SwiftUI

struct ArticleDetailView: View {
    let sourceId: Int
    let sourceTitle: String?

    @State private var detail: SourceDetail?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showFullArticle = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading article...")
            } else if let error {
                ContentUnavailableView(
                    "Failed to Load",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Title
                        Text(detail.title ?? "Untitled")
                            .font(.title2.bold())

                        // Category + URL
                        HStack {
                            if let category = detail.category {
                                Text(category.replacingOccurrences(of: "_", with: " "))
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(.blue.opacity(0.1))
                                    .clipShape(Capsule())
                            }
                            Spacer()
                        }

                        // Summary
                        if let summary = detail.summary {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Summary")
                                    .font(.headline)
                                Text(summary)
                                    .font(.body)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Divider()

                        // Full article
                        if let content = detail.rawContent {
                            VStack(alignment: .leading, spacing: 8) {
                                Button(action: {
                                    withAnimation { showFullArticle.toggle() }
                                }) {
                                    HStack {
                                        Text(showFullArticle ? "Hide full article" : "Show full article")
                                            .font(.headline)
                                        Spacer()
                                        Image(systemName: showFullArticle ? "chevron.up" : "chevron.down")
                                    }
                                }

                                if showFullArticle {
                                    Text(content)
                                        .font(.body)
                                        .textSelection(.enabled)
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle(sourceTitle ?? "Article")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink {
                    ChatView(sourceId: sourceId, sourceTitle: sourceTitle)
                } label: {
                    Label("Chat", systemImage: "bubble.left.and.bubble.right")
                }
            }
        }
        .task {
            do {
                detail = try await APIClient.shared.getSource(id: sourceId)
                isLoading = false
            } catch {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
    }
}
