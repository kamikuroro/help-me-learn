import SwiftUI

struct LibraryView: View {
    @State private var viewModel = LibraryViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search knowledge base...", text: $viewModel.searchQuery)
                        .textInputAutocapitalization(.never)
                        .onSubmit { Task { await viewModel.search() } }
                    if !viewModel.searchQuery.isEmpty {
                        Button(action: {
                            viewModel.searchQuery = ""
                            viewModel.searchResults = []
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(8)
                .background(.quaternary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        CategoryChip(name: "All", isSelected: viewModel.selectedCategory == nil) {
                            viewModel.selectedCategory = nil
                            Task { await viewModel.loadSources() }
                        }
                        ForEach(viewModel.categories, id: \.self) { category in
                            CategoryChip(
                                name: category.replacingOccurrences(of: "_", with: " "),
                                isSelected: viewModel.selectedCategory == category
                            ) {
                                viewModel.selectedCategory = category
                                Task { await viewModel.loadSources() }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                if !viewModel.searchResults.isEmpty {
                    List(viewModel.searchResults, id: \.sourceId) { result in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(result.title)
                                .font(.headline)
                            Text(result.excerpt)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                        }
                    }
                } else {
                    List(viewModel.sources) { source in
                        NavigationLink {
                            ChatView(sourceId: source.id, sourceTitle: source.title)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(source.title ?? "Untitled")
                                    .font(.headline)
                                if let category = source.category {
                                    Text(category.replacingOccurrences(of: "_", with: " "))
                                        .font(.caption)
                                        .foregroundStyle(.blue)
                                }
                                if let summary = source.summary {
                                    Text(summary)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .task { await viewModel.loadSources() }
        }
    }
}

struct CategoryChip: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(name.capitalized)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? .blue : .quaternary)
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}
