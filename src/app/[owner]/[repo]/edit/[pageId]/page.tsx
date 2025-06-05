"use client"

import { useEffect, useState } from "react"
import DeepWikiEditor from "@/components/DeepWikiEditor"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"

interface RouteParams {
  owner: string
  repo: string
  pageId: string
}

export default function EditWikiPage() {
  const params = useParams() as unknown as RouteParams
  const { owner, repo, pageId } = params
  const searchParams = useSearchParams()
  const repoType = searchParams.get('type') || 'github'
  const language = searchParams.get('language') || 'en'

  const [initialContent, setInitialContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPageContent = async () => {
      try {
        // First try to get content from sessionStorage for this specific page
        const stored = sessionStorage.getItem(`editPageContent_${pageId}`)
        if (stored) {
          setInitialContent(stored)
          setIsLoading(false)
          return
        }

        // If not in sessionStorage, fetch from Supabase
        const params = new URLSearchParams({
          owner,
          repo,
          repo_type: repoType,
          language,
        })
        const response = await fetch(`/api/wiki_cache?${params.toString()}`)

        if (response.ok) {
          const cachedData = await response.json()
          if (cachedData?.generated_pages?.[pageId]?.content) {
            setInitialContent(cachedData.generated_pages[pageId].content)
          } else {
            setError("Page content not found in cache")
          }
        } else {
          setError("Failed to fetch page content")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred while fetching page content")
      } finally {
        setIsLoading(false)
      }
    }

    fetchPageContent()
  }, [owner, repo, pageId, repoType, language])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading page content...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link
            href={`/${owner}/${repo}`}
            className="text-violet-500 hover:text-violet-600"
          >
            Return to Wiki
          </Link>
        </div>
      </div>
    )
  }

  return (
    <DeepWikiEditor
      initialContent={initialContent}
      owner={owner}
      repo={repo}
      pageId={pageId}
    />
  )
} 