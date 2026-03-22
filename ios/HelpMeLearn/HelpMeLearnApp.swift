import SwiftUI

@main
struct HelpMeLearnApp: App {
    var body: some Scene {
        WindowGroup {
            MainTabView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        VStack(spacing: 0) {
            TabView {
                FeedView()
                    .tabItem {
                        Label("Feed", systemImage: "list.bullet")
                    }

                ChatView()
                    .tabItem {
                        Label("Chat", systemImage: "bubble.left.and.bubble.right")
                    }

                LibraryView()
                    .tabItem {
                        Label("Library", systemImage: "books.vertical")
                    }

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gear")
                    }
            }

            MiniPlayerView()
        }
    }
}
