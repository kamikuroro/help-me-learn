import SwiftUI
import UniformTypeIdentifiers

struct BookUploadView: View {
    @Bindable var viewModel: BooksViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showFilePicker = false
    @State private var selectedFileURL: URL?
    @State private var selectedFileName = ""
    @State private var title = ""
    @State private var author = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button(action: { showFilePicker = true }) {
                        HStack {
                            Image(systemName: selectedFileURL != nil ? "checkmark.circle.fill" : "doc.badge.plus")
                                .foregroundStyle(selectedFileURL != nil ? .green : .blue)
                            Text(selectedFileURL != nil ? selectedFileName : "Select PDF")
                        }
                    }
                }

                Section("Details (Optional)") {
                    TextField("Title", text: $title)
                    TextField("Author", text: $author)
                }
            }
            .navigationTitle("Upload Book")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isUploading {
                        ProgressView()
                    } else {
                        Button("Upload") {
                            Task { await upload() }
                        }
                        .disabled(selectedFileURL == nil)
                    }
                }
            }
            .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [UTType.pdf]) { result in
                switch result {
                case .success(let url):
                    selectedFileURL = url
                    selectedFileName = url.lastPathComponent
                    if title.isEmpty {
                        title = url.deletingPathExtension().lastPathComponent
                    }
                case .failure:
                    break
                }
            }
        }
    }

    private func upload() async {
        guard let url = selectedFileURL else { return }
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        do {
            let data = try Data(contentsOf: url)
            let t = title.trimmingCharacters(in: .whitespaces).isEmpty ? nil : title
            let a = author.trimmingCharacters(in: .whitespaces).isEmpty ? nil : author
            await viewModel.uploadBook(pdfData: data, filename: selectedFileName, title: t, author: a)
            dismiss()
        } catch {
            viewModel.error = error.localizedDescription
        }
    }
}
