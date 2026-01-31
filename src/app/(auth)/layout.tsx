import { ThemeProvider } from "next-themes"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider defaultTheme="system" attribute="class">
      <div className="flex min-h-screen flex-col bg-white dark:bg-gray-950">
        {/* Header - matches sidebar header style */}
        <header className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto max-w-screen-2xl">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 dark:bg-indigo-500">
                <svg
                  className="h-4 w-4 text-white dark:text-gray-900"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                VisTrial
              </span>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-10">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-center text-xs text-gray-500">
            © {new Date().getFullYear()} VisTrial. All rights reserved.
          </p>
        </footer>
      </div>
    </ThemeProvider>
  )
}
