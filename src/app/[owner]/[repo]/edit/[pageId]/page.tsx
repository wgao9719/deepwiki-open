"use client"

import { useEffect, useState } from "react"
import DeepWikiEditor from "@/components/DeepWikiEditor"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"

interface RouteParams {
  owner: string
  repo: string
  pageId: string
}

export default function EditWikiPage() {
  const params = useParams() as unknown as RouteParams
  const searchParams = useSearchParams()
  const { user, isAdmin } = useAuth()
  const { owner, repo, pageId } = params

  const [initialContent, setInitialContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Repository permissions state
  const [repositoryPermissions, setRepositoryPermissions] = useState<{
    isOwner: boolean;
    isCollaborator: boolean;
    relationship?: string;
  } | null>(null)

  // Check repository permissions
  useEffect(() => {
    const checkRepositoryPermissions = async () => {
      if (!user?.id || !owner || !repo) {
        setRepositoryPermissions(null);
        return;
      }

      try {
        const response = await fetch(`/api/user/profile/${user.id}`);
        if (!response.ok) {
          setRepositoryPermissions(null);
          return;
        }

        const data = await response.json();
        const profile = data.profile;
        
        if (!profile) {
          setRepositoryPermissions(null);
          return;
        }

        // Combine all repositories
        const allRepos = [
          ...(profile.github_repos || []),
          ...(profile.github_collaborator_repos || []),
          ...(profile.github_other_repos || [])
        ];

        // Find the current repository
        const currentRepoFullName = `${owner}/${repo}`;
        const currentRepo = allRepos.find(r => r.full_name === currentRepoFullName);

        if (currentRepo) {
          setRepositoryPermissions({
            isOwner: currentRepo.is_owner || false,
            isCollaborator: currentRepo.is_collaborator || false,
            relationship: currentRepo.relationship
          });
        } else {
          // Repository not found in user's repos - treat as unknown
          setRepositoryPermissions({
            isOwner: false,
            isCollaborator: false,
            relationship: 'unknown'
          });
        }
      } catch (error) {
        console.error('Error checking repository permissions:', error);
        setRepositoryPermissions(null);
      }
    };

    checkRepositoryPermissions();
  }, [user?.id, owner, repo]);

  useEffect(() => {
    const loadPageContent = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // First check sessionStorage for cached content
        const cachedContent = sessionStorage.getItem(`editPageContent_${pageId}`)
        if (cachedContent) {
          setInitialContent(cachedContent)
          setIsLoading(false)
          return
        }

        // If no cached content, fetch from API
        const params = new URLSearchParams({
          owner,
          repo,
          repo_type: searchParams?.get("type") || "github",
          language: searchParams?.get("language") || "en",
        })

        const response = await fetch(`/api/wiki_cache?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch page content: ${response.status}`)
        }

        const data = await response.json()
        const pageContent = data?.generated_pages?.[pageId]?.content || ""
        setInitialContent(pageContent)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load page content")
      } finally {
        setIsLoading(false)
      }
    }

    if (pageId) {
      loadPageContent()
    }
  }, [owner, repo, pageId, searchParams])

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
      isOwner={repositoryPermissions?.isOwner || false}
      isCollaborator={repositoryPermissions?.isCollaborator || false}
      isAdmin={isAdmin}
    />
  )
} 