import SwiftUI

struct SourceDetailView: View {
    let sourceId: Int
    let sourceTitle: String?
    @State private var detail: SourceDetail?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading article...")
            } else if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Header
                        VStack(alignment: .leading, spacing: 8) {
                            Text(detail.title ?? "Untitled")
                                .font(.title2)
                                .bold()

                            if let category = detail.category {
                                Text(category.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(.blue.opacity(0.1))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }

                            if !detail.tags.isEmpty {
                                FlowLayout(spacing: 6) {
                                    ForEach(detail.tags, id: \.self) { tag in
                                        Text(tag)
                                            .font(.caption2)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(Color(.systemGray5))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                        }

                        // Summary
                        if let summary = detail.summary, !summary.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Summary", systemImage: "text.alignleft")
                                    .font(.headline)
                                Text(LocalizedStringKey(summary))
                                    .font(.body)
                            }
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // Full content
                        if let content = detail.rawContent, !content.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Full Article", systemImage: "doc.text")
                                    .font(.headline)
                                Text(LocalizedStringKey(content))
                                    .font(.body)
                            }
                        }
                    }
                    .padding()
                }
            } else if let errorMessage {
                ContentUnavailableView("Failed to Load", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
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
            await loadDetail()
        }
    }

    private func loadDetail() async {
        do {
            detail = try await APIClient.shared.getSource(id: sourceId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
