"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Save, ChevronRight, Sparkles, Send, RefreshCw, PanelLeft, PanelRight,
  Bot,
} from "lucide-react"
import Markdown from "./Markdown"
import WikiTreeView from "./WikiTreeView"
import { useRouter, useSearchParams } from "next/navigation"
import { FaHome } from "react-icons/fa"
import Link from "next/link"
import ThemeToggle from "@/components/theme-toggle"

interface Selection {
  text: string
  start: number
  end: number
}

export interface DeepWikiEditorProps {
  /** Initial markdown content to populate the editor with */
  initialContent?: string
  /** Optional information that might be useful when saving */
  owner?: string
  repo?: string
  pageId?: string
}

// Types for wiki structure
interface WikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  importance: "high" | "medium" | "low";
  relatedPages: string[];
  parentId?: string;
  isSection?: boolean;
  children?: string[];
}

interface WikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[];
}

interface WikiStructure {
  id: string;
  title: string;
  description: string;
  pages: WikiPage[];
  sections: WikiSection[];
  rootSections: string[];
}

export default function DeepWikiEditor({
  initialContent = "",
  owner,
  repo,
  pageId,
}: DeepWikiEditorProps) {
  // Initialise the editor with `initialContent` if provided; otherwise use a sample placeholder
  const [content, setContent] = useState(
    initialContent ||
      `# New Wiki Page\n\nStart writing your documentation here...`,
  )

  const [selectedText, setSelectedText] = useState<Selection | null>(null)
  const [llmPrompt, setLlmPrompt] = useState("")
  const [llmResponse, setLlmResponse] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true)
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true)
  const [wikiStructure, setWikiStructure] = useState<WikiStructure | null>(null)
  const [isStructureLoading, setIsStructureLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Fetch wiki structure for sidebar
  useEffect(() => {
    const fetchStructure = async () => {
      if (!owner || !repo) return
      try {
        setIsStructureLoading(true)
        const params = new URLSearchParams({
          owner,
          repo,
          repo_type: searchParams?.get("type") || "github",
          language: searchParams?.get("language") || "en",
        })
        const res = await fetch(`/api/wiki_cache?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.wiki_structure) {
            setWikiStructure(data.wiki_structure)
          }
        } else {
          console.error("Failed to fetch wiki_structure")
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsStructureLoading(false)
      }
    }
    fetchStructure()
  }, [owner, repo, searchParams])

  // When navigating to a different page, refresh editor state
  useEffect(() => {
    setContent(initialContent || "")
    setSelectedText(null)
    setLlmPrompt("")
    setLlmResponse("")
  }, [initialContent, pageId])

  const handlePageSelect = (targetPageId: string) => {
    if (!owner || !repo || targetPageId === pageId) return
    // Check unsaved changes (optional):
    // TODO: prompt user if content changed and not saved.
    const params = new URLSearchParams(searchParams?.toString())
    router.push(`/${owner}/${repo}/edit/${targetPageId}?${params.toString()}`)
  }

  const handleTextSelection = useCallback(() => {
    if (editorRef.current) {
      const start = editorRef.current.selectionStart
      const end = editorRef.current.selectionEnd

      if (start !== end) {
        const selectedText = content.substring(start, end)
        setSelectedText({ text: selectedText, start, end })
        setLlmPrompt(
          `Please rewrite the following text to improve clarity and readability:\n\n"${selectedText}"`,
        )
        if (!rightSidebarVisible) {
          setRightSidebarVisible(true)
        }
      } else {
        setSelectedText(null)
        setLlmPrompt("")
      }
    }
  }, [content, rightSidebarVisible])

  const handleLlmSubmit = async () => {
    if (!llmPrompt.trim()) return

    setIsProcessing(true)

    // TODO: Replace this mock with your actual LLM call
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const mockResponse = selectedText
      ? `Here's an improved version of the selected text:\n\n"${selectedText.text.replace(/\b\w+\b/g, (word) =>
          Math.random() > 0.7 ? `${word} (enhanced)` : word,
        )}"`
      :
        "I can help you improve your documentation. Please select some text in the editor to get started."

    setLlmResponse(mockResponse)
    setIsProcessing(false)
  }

  const applyLlmSuggestion = () => {
    if (!selectedText || !llmResponse) return

    // Extract the suggested text from the LLM response
    const match = llmResponse.match(/"([^"]+)"/g)
    if (match && match.length > 1) {
      const suggestion = match[1].replace(/"/g, "")
      const newContent = content.substring(0, selectedText.start) + suggestion + content.substring(selectedText.end)
      setContent(newContent)
      setSelectedText(null)
      setLlmResponse("")
      setLlmPrompt("")
    }
  }

  const handleSave = async () => {
    try {
      console.log('Starting save process for:', { owner, repo, pageId })
      
      // First update the local cache
      const params = new URLSearchParams({
        owner: owner || '',
        repo: repo || '',
        repo_type: 'github', // Default to github for now
        language: 'en', // Default to English for now
      })
      
      console.log('Fetching current cache with params:', params.toString())
      
      // Fetch current cache
      const response = await fetch(`/api/wiki_cache?${params.toString()}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to fetch cache:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to fetch current wiki cache: ${response.status} ${response.statusText}`)
      }
      
      const cachedData = await response.json()
      console.log('Retrieved cache data:', {
        hasGeneratedPages: !!cachedData?.generated_pages,
        pageCount: Object.keys(cachedData?.generated_pages || {}).length,
        targetPageExists: !!cachedData?.generated_pages?.[pageId || '']
      })

      if (!cachedData?.generated_pages || !cachedData?.wiki_structure) {
        throw new Error('Invalid cache data structure: missing required fields')
      }

      // Update the specific page content
      const updatedPage = {
        ...cachedData.generated_pages[pageId || ''],
        content: content,
        updated_at: new Date().toISOString()
      }
      
      console.log('Updating page content:', {
        pageId,
        contentLength: content.length,
        hasExistingPage: !!cachedData.generated_pages[pageId || '']
      })

      cachedData.generated_pages[pageId || ''] = updatedPage

      // Save back to Supabase
      console.log('Saving updated cache to Supabase...')
      const saveResponse = await fetch(`/api/wiki_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          owner: owner || '',
          repo: repo || '',
          repo_type: 'github',
          language: 'en',
          wiki_structure: cachedData.wiki_structure,
          generated_pages: cachedData.generated_pages,
          repo_url: cachedData.repo_url
        }),
      })

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text()
        console.error('Failed to save to Supabase:', {
          status: saveResponse.status,
          statusText: saveResponse.statusText,
          error: errorText
        })
        throw new Error(`Failed to save to Supabase: ${saveResponse.status} ${saveResponse.statusText}`)
      }

      const saveResult = await saveResponse.json()
      console.log('Save response:', saveResult)

      // Also update sessionStorage for immediate viewing (page specific)
      if (pageId) {
        sessionStorage.setItem(`editPageContent_${pageId}`, content)
      }
      
      // Show success message
      alert("Content saved successfully!")
    } catch (err) {
      console.error('Error saving content:', err)
      alert(err instanceof Error ? err.message : 'Failed to save content')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      {/* Header - Fixed */}
      <header className="flex-none z-50 bg-[var(--card-bg)] border-b border-[var(--border-color)] px-6 py-4 shadow-custom">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[var(--accent-primary)] hover:text-[var(--highlight)] transition-colors border-b border-[var(--border-color)] hover:border-[var(--accent-primary)] pb-0.5"
            >
              <FaHome /> Home
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <h1 className="text-xl font-semibold text-[var(--foreground)]">DeepWiki Editor</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={handleSave} className="btn-japanese flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Flex container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Fixed */}
        {leftSidebarVisible && (
          <div className="w-64 flex-none bg-[var(--background)] flex flex-col border-r border-[var(--border-color)]">
            {/* Left Sidebar Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{repo ?? "Wiki"}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeftSidebarVisible(false)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
                >
                  <PanelLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Left Sidebar Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-3">Pages</h3>
                {isStructureLoading && (
                  <div className="text-xs text-[var(--muted-foreground)]">Loading pages...</div>
                )}
                {wikiStructure && (
                  <WikiTreeView
                    wikiStructure={wikiStructure}
                    currentPageId={pageId || ""}
                    onPageSelect={handlePageSelect}
                  />
                )}
                {!isStructureLoading && !wikiStructure && (
                  <div className="text-xs text-[var(--muted-foreground)]">No pages found</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Editor and AI Assistant */}
        <div className="flex-1 flex bg-[var(--background)]">
          {/* Unified Header */}
          <div className="flex-1 flex flex-col">
            <div className="flex-none flex border-b border-[var(--border-color)]">
              {/* Editor Header */}
              <div className="flex-1 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-semibold text-[var(--foreground)]">{pageId || "Wiki Page"}</h1>
                    <div className="flex items-center text-sm text-[var(--muted-foreground)]">
                      <ChevronRight className="w-4 h-4 mr-1" />
                      Editing Markdown
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {!leftSidebarVisible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLeftSidebarVisible(true)}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <PanelLeft className="w-4 h-4" />
                      </Button>
                    )}
                    {!rightSidebarVisible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRightSidebarVisible(true)}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <PanelRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Assistant Header */}
              {rightSidebarVisible && (
                <div className="w-96 px-6 py-4 border-l border-[var(--border-color)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Bot className="w-5 h-5 text-[var(--accent)] mr-2" />
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">AI Assistant</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRightSidebarVisible(false)}
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
                    >
                      <PanelRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Side-by-side editor and live preview */}
              <div className="flex-1 flex overflow-hidden">
                {/* Markdown editor */}
                <div className="w-1/2 h-full bg-[var(--background)]">
                  <ScrollArea className="h-full">
                    <Textarea
                      ref={editorRef}
                      value={content}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                      onSelect={handleTextSelection}
                      className="min-h-[600px] border-none resize-none focus:ring-0 text-[var(--foreground)] leading-relaxed p-6 bg-[var(--background)] h-full font-mono"
                      placeholder="Start editing your documentation..."
                    />
                  </ScrollArea>
                </div>

                {/* Rendered preview */}
                <div className="w-1/2 h-full border-l border-[var(--border-color)] bg-[var(--background)]">
                  <ScrollArea className="h-full">
                    <div className="p-6">
                      <Markdown content={content} />
                    </div>
                  </ScrollArea>
                </div>
              </div>

              {/* AI Assistant Content */}
              {rightSidebarVisible && (
                <div className="w-96 flex-none border-l border-[var(--border-color)] flex flex-col bg-[var(--background)]">
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 flex flex-col h-full">
                      {selectedText && (
                        <div className="mb-4 p-3 bg-[var(--accent)]/10 rounded-lg border border-[var(--accent)]/20">
                          <p className="text-sm text-[var(--accent)] font-medium mb-1">Selected Text:</p>
                          <p className="text-sm text-[var(--foreground)] italic">"{selectedText.text}"</p>
                        </div>
                      )}

                      <div className="flex flex-col h-full">
                        <div className="flex-none">
                          <label className="text-sm font-medium text-[var(--foreground)] mb-2">Prompt for AI Assistant</label>
                          <Textarea
                            value={llmPrompt}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLlmPrompt(e.target.value)}
                            placeholder="Select text in the editor or type your own prompt..."
                            className="mb-4 h-32 border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20 bg-[var(--background)] text-[var(--foreground)]"
                          />

                          <Button
                            onClick={handleLlmSubmit}
                            disabled={!llmPrompt.trim() || isProcessing}
                            className="mb-4 w-full btn-japanese flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Bot className="w-4 h-4" />
                            )}
                            {isProcessing ? "Processing..." : "Send to AI"}
                          </Button>
                        </div>

                        {llmResponse && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <label className="text-sm font-medium text-[var(--foreground)] mb-2">AI Response</label>
                            <div className="flex-1 p-3 bg-[var(--accent)]/5 rounded-lg border border-[var(--border-color)] mb-4 overflow-auto">
                              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{llmResponse}</p>
                            </div>

                            {selectedText && (
                              <div className="flex-none">
                                <Button
                                  onClick={applyLlmSuggestion}
                                  variant="outline"
                                  className="w-full border-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
                                >
                                  Apply Suggestion
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Fixed */}
      <footer className="flex-none z-50 bg-[var(--card-bg)] border-t border-[var(--border-color)] px-6 py-3">
        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
      </footer>
    </div>
  )
} 