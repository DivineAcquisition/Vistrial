import { siteConfig } from "./siteConfig"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50 sm:text-6xl">
          {siteConfig.name}
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          {siteConfig.description}
        </p>
      </div>
    </main>
  )
}
