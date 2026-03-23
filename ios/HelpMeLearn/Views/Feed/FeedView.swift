import SwiftUI

struct FeedView: View {
    @State private var viewModel = FeedViewModel()
    @State private var showIngestSheet = false
    @State private var ingestURL = ""
    @State private var ingestTitle = ""
    @State private var ingestContent = ""

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
                            SourceRowView(source: source, onGenerateAudio: { type, mode in
                                Task { await viewModel.generateAudio(sourceId: source.id, type: type, mode: mode) }
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
                        Section {
                            TextField("URL", text: $ingestURL)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                        }

                        Section {
                            TextField("Title", text: $ingestTitle)
                            TextEditor(text: $ingestContent)
                                .frame(minHeight: 120)
                        } header: {
                            Text("Paste Content (optional)")
                        } footer: {
                            Text("For sites that block scraping (e.g. WeChat), paste the article text here.")
                        }
                    }
                    .navigationTitle("Add Source")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showIngestSheet = false
                                ingestURL = ""
                                ingestTitle = ""
                                ingestContent = ""
                            }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                Task {
                                    let content = ingestContent.trimmingCharacters(in: .whitespaces).isEmpty ? nil : ingestContent
                                    let title = ingestTitle.trimmingCharacters(in: .whitespaces).isEmpty ? nil : ingestTitle
                                    await viewModel.ingestURL(ingestURL, content: content, title: title)
                                    ingestURL = ""
                                    ingestTitle = ""
                                    ingestContent = ""
                                    showIngestSheet = false
                                }
                            }
                            .disabled(ingestURL.isEmpty)
                        }
                    }
                }
                .presentationDetents([.large])
            }
            .task { await viewModel.loadSources() }
        }
    }
}
