import SwiftUI

struct FeedView: View {
    @State private var viewModel = FeedViewModel()
    @State private var showIngestSheet = false
    @State private var ingestURL = ""

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.sources.isEmpty {
                    ProgressView("Loading sources...")
                } else if viewModel.sources.isEmpty {
                    ContentUnavailableView(
                        "No Sources Yet",
                        systemImage: "doc.text",
                        description: Text("Share a URL or tap + to add one")
                    )
                } else {
                    List {
                        ForEach(viewModel.sources) { source in
                            SourceRowView(source: source, onGenerateAudio: { type in
                                Task { await viewModel.generateAudio(sourceId: source.id, type: type) }
                            })
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                let source = viewModel.sources[index]
                                Task { await viewModel.deleteSource(source) }
                            }
                        }
                    }
                    .refreshable { await viewModel.refresh() }
                }
            }
            .navigationTitle("Feed")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showIngestSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("Error", isPresented: .init(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.error = nil } }
            )) {
                Button("OK") { viewModel.error = nil }
            } message: {
                Text(viewModel.error ?? "")
            }
            .sheet(isPresented: $showIngestSheet) {
                NavigationStack {
                    Form {
                        TextField("URL", text: $ingestURL)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                    .navigationTitle("Add URL")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showIngestSheet = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                Task {
                                    await viewModel.ingestURL(ingestURL)
                                    ingestURL = ""
                                    showIngestSheet = false
                                }
                            }
                            .disabled(ingestURL.isEmpty)
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .task { await viewModel.loadSources() }
        }
    }
}
