import SwiftUI
import PDFKit

struct PDFPreviewView: View {
    let bookId: Int
    @State private var pdfData: Data?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading PDF...")
            } else if let pdfData, let document = PDFDocument(data: pdfData) {
                PDFKitView(document: document)
            } else {
                ContentUnavailableView(
                    "PDF Not Available",
                    systemImage: "doc.fill",
                    description: Text(error ?? "Could not load PDF")
                )
            }
        }
        .navigationTitle("Preview")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                pdfData = try await APIClient.shared.downloadBookPDF(bookId: bookId)
            } catch {
                self.error = error.localizedDescription
            }
            isLoading = false
        }
    }
}

struct PDFKitView: UIViewRepresentable {
    let document: PDFDocument

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.document = document
        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context: Context) {}
}
