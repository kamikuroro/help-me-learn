import SwiftUI

struct BooksView: View {
    @State private var viewModel = BooksViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.books.isEmpty {
                    ProgressView("Loading books...")
                } else if viewModel.books.isEmpty {
                    ContentUnavailableView(
                        "No Books Yet",
                        systemImage: "book.closed",
                        description: Text("Ingest a PDF book via the API to get started")
                    )
                } else {
                    List {
                        ForEach(viewModel.books) { book in
                            NavigationLink(value: book.id) {
                                BookRowView(book: book)
                            }
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                let book = viewModel.books[index]
                                Task { await viewModel.deleteBook(book) }
                            }
                        }
                    }
                    .refreshable { await viewModel.loadBooks() }
                }
            }
            .navigationTitle("Books")
            .navigationDestination(for: Int.self) { bookId in
                BookDetailView(bookId: bookId)
            }
            .alert("Error", isPresented: .init(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.error = nil } }
            )) {
                Button("OK") { viewModel.error = nil }
            } message: {
                Text(viewModel.error ?? "")
            }
            .task { await viewModel.loadBooks() }
        }
    }
}

struct BookRowView: View {
    let book: Book

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(book.title)
                .font(.headline)
                .lineLimit(2)

            HStack(spacing: 12) {
                if let author = book.author {
                    Text(author)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let chapters = book.totalChapters {
                    Label("\(chapters) chapters", systemImage: "list.number")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                StatusBadge(status: book.status)
            }
        }
        .padding(.vertical, 4)
    }
}

// StatusBadge is defined in SourceRowView.swift and shared across views
