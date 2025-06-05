"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Save, ChevronRight, Sparkles, Send, RefreshCw, PanelLeft, PanelRight,
  Bot, ChevronDown, ChevronUp, User, Quote,
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

interface FloatingButton {
  visible: boolean
  x: number
  y: number
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
  const [chatHistory, setChatHistory] = useState<Array<{prompt: string, response: string}>>([])
  const [floatingButton, setFloatingButton] = useState<FloatingButton>({ visible: false, x: 0, y: 0 })
  const [isAIPanelExpanded, setIsAIPanelExpanded] = useState(false)
  const [wikiStructure, setWikiStructure] = useState<WikiStructure | null>(null)
  const [isStructureLoading, setIsStructureLoading] = useState(false)
  const [cachedStructures, setCachedStructures] = useState<Record<string, WikiStructure>>({})
  const [highlightedRanges, setHighlightedRanges] = useState<Selection[]>([])

  const router = useRouter()
  const searchParams = useSearchParams()

  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Fetch wiki structure for sidebar
  useEffect(() => {
    const fetchStructure = async () => {
      if (!owner || !repo) return
      
      // Check if we already have the structure cached
      const cacheKey = `${owner}/${repo}`
      if (cachedStructures[cacheKey]) {
        setWikiStructure(cachedStructures[cacheKey])
        return
      }

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
            // Cache the structure
            setCachedStructures(prev => ({
              ...prev,
              [cacheKey]: data.wiki_structure
            }))
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
  }, [owner, repo, searchParams, cachedStructures])

  // When navigating to a different page, refresh editor state
  useEffect(() => {
    if (initialContent) {
      setContent(initialContent)
      setSelectedText(null)
      setLlmPrompt("")
      setLlmResponse("")
    }
  }, [initialContent])

  const handlePageSelect = async (targetPageId: string) => {
    if (!owner || !repo || targetPageId === pageId) return

    try {
      // Fetch the new page content
      const params = new URLSearchParams({
        owner,
        repo,
        repo_type: searchParams?.get("type") || "github",
        language: searchParams?.get("language") || "en",
      })
      
      const res = await fetch(`/api/wiki_cache?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to fetch page content')
      }
      
      const data = await res.json()
      const newPageContent = data?.generated_pages?.[targetPageId]?.content || ""

      // Update the URL without a full page reload
      const newParams = new URLSearchParams(searchParams?.toString())
      newParams.set('page', targetPageId)
      window.history.pushState({}, '', `/${owner}/${repo}/edit/${targetPageId}?${newParams.toString()}`)

      // Update the content and pageId
      setContent(newPageContent)
      setSelectedText(null)
      setLlmPrompt("")
      setLlmResponse("")

      // Update wiki structure if it's not already cached
      const cacheKey = `${owner}/${repo}`
      if (data?.wiki_structure && !cachedStructures[cacheKey]) {
        setWikiStructure(data.wiki_structure)
        setCachedStructures(prev => ({
          ...prev,
          [cacheKey]: data.wiki_structure
        }))
      }
    } catch (err) {
      console.error('Error loading page:', err)
    }
  }

  // Add event listener for browser back/forward buttons
  useEffect(() => {
    const handlePopState = async () => {
      const pathParts = window.location.pathname.split('/')
      const newPageId = pathParts[pathParts.length - 1]
      if (newPageId && newPageId !== pageId) {
        await handlePageSelect(newPageId)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [pageId])

  const handleTextSelection = useCallback(() => {
    console.log('handleTextSelection called')
    if (editorRef.current) {
      const start = editorRef.current.selectionStart
      const end = editorRef.current.selectionEnd
      console.log('Selection range:', start, end)

      if (start !== end) {
        const selectedText = content.substring(start, end)
        console.log('Selected text:', selectedText)
        setSelectedText({ text: selectedText, start, end })

        // Calculate button position
        const textarea = editorRef.current
        const rect = textarea.getBoundingClientRect()
        
        // Create a temporary element to measure text position
        const tempDiv = document.createElement('div')
        tempDiv.style.position = 'absolute'
        tempDiv.style.visibility = 'hidden'
        tempDiv.style.height = 'auto'
        tempDiv.style.width = `${rect.width - 48}px` // Account for padding
        tempDiv.style.fontSize = window.getComputedStyle(textarea).fontSize
        tempDiv.style.fontFamily = window.getComputedStyle(textarea).fontFamily
        tempDiv.style.lineHeight = window.getComputedStyle(textarea).lineHeight
        tempDiv.style.whiteSpace = 'pre-wrap'
        tempDiv.textContent = content.substring(0, start)
        
        document.body.appendChild(tempDiv)
        const tempHeight = tempDiv.offsetHeight
        document.body.removeChild(tempDiv)

        const buttonX = rect.right - 40
        const buttonY = rect.top + tempHeight + 24 - textarea.scrollTop

        setFloatingButton({
          visible: true,
          x: buttonX,
          y: buttonY
        })

        if (!rightSidebarVisible) {
          setRightSidebarVisible(true)
        }
      } else {
        setSelectedText(null)
        setFloatingButton({ visible: false, x: 0, y: 0 })
      }
    }
  }, [content, rightSidebarVisible])

  const addSelectedTextToPrompt = useCallback(() => {
    console.log('addSelectedTextToPrompt called')
    console.log('selectedText state:', selectedText)
    console.log('current llmPrompt:', llmPrompt)
    console.log('current highlightedRanges:', highlightedRanges)
    
    if (selectedText) {
      try {
        console.log('Adding selected text to prompt:', selectedText)
        const newText = `"${selectedText.text}"\n\n`
        console.log('New text to add:', newText)
        setLlmPrompt(prev => prev + newText)
        setFloatingButton({ visible: false, x: 0, y: 0 })
        setHighlightedRanges(prev => [...prev, selectedText])
        console.log('Updated highlighted ranges:', [...highlightedRanges, selectedText])
        setSelectedText(null)
        
        // Clear selection in textarea
        if (editorRef.current) {
          editorRef.current.setSelectionRange(editorRef.current.selectionEnd, editorRef.current.selectionEnd)
        }
        console.log('addSelectedTextToPrompt completed successfully')
      } catch (error) {
        console.error('Error in addSelectedTextToPrompt:', error)
      }
    } else {
      console.log('No selectedText available')
    }
  }, [selectedText, highlightedRanges, llmPrompt])

  // Hide floating button when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (floatingButton.visible && editorRef.current && !editorRef.current.contains(event.target as Node)) {
        setFloatingButton({ visible: false, x: 0, y: 0 })
        setSelectedText(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [floatingButton.visible])

  const handleLlmSubmit = async () => {
    if (!llmPrompt.trim()) return

    setIsProcessing(true)
    setLlmResponse("")

    try {
      // Build repo URL if possible
      const repoUrl = owner && repo ? `https://github.com/${owner}/${repo}` : "";

      const requestBody = {
        repo_url: repoUrl,
        current_page_title: pageId || "Current Page",
        current_page_content: content,
        current_page_files: [],
        edit_request: llmPrompt,
      };

      const response = await fetch("/api/wiki/edit/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let completedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        completedText += decoder.decode(value, { stream: true });
        setLlmResponse(completedText);
      }

      setChatHistory(prev => [...prev, { prompt: llmPrompt, response: completedText }]);

    } catch (error) {
      console.error("LLM request error", error);
      setLlmResponse("Error generating suggestions. Please try again.");
    } finally {
      setIsProcessing(false);
    }
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

  const highlightedContent = useMemo(() => {
    console.log('Computing highlighted content with', highlightedRanges.length, 'ranges')
    if (highlightedRanges.length === 0) return content

    // Sort ranges to guarantee deterministic behaviour
    const ranges = [...highlightedRanges].sort((a, b) => a.start - b.start)
    console.log('Sorted ranges:', ranges)

    let result = ""
    let cursor = 0

    ranges.forEach(({ start, end }) => {
      // Guard against stale indexes that might be outside the current bounds after edits
      if (start >= content.length) return
      const safeEnd = Math.min(end, content.length)

      // Append untouched text
      result += content.slice(cursor, start)

      // Append highlighted part with a clearer background. Using Tailwind classes ensures
      // the highlight is very noticeable both in light and dark themes.
      result += `<mark class="bg-yellow-200 dark:bg-yellow-600/40 rounded-sm">${content.slice(start, safeEnd)}</mark>`

      // Move the cursor forward
      cursor = safeEnd
    })

    // Append the remainder of the document
    result += content.slice(cursor)

    console.log('Final highlighted content:', result)
    return result
  }, [content, highlightedRanges])

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
      <div className="flex-1 flex overflow-hidden relative">
        {/* Floating Quote Button */}
        {floatingButton.visible && (
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Floating quote button clicked')
              addSelectedTextToPrompt()
            }}
            className="fixed z-[9999] w-8 h-8 bg-[var(--accent-primary)] hover:bg-[var(--highlight)] text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
            style={{
              left: `${floatingButton.x}px`,
              top: `${floatingButton.y}px`,
              pointerEvents: 'auto'
            }}
          >
            <Quote className="w-4 h-4" />
          </button>
        )}

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

        {/* Main Editor */}
        <div className="flex-1 flex bg-[var(--background)]">
          {/* Editor Header */}
          <div className="flex-1 flex flex-col">
            <div className="flex-none px-6 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold text-[var(--foreground)]">{pageId || "Wiki Page"}</h1>
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
                      className="min-h-[600px] border-none resize-none focus:ring-0 text-[var(--foreground)] leading-relaxed p-6 bg-[var(--background)] h-full font-mono text-sm"
                      placeholder="Start editing your documentation..."
                    />
                  </ScrollArea>
                </div>

                {/* Rendered preview */}
                <div className="w-1/2 h-full border-l border-[var(--border-color)] bg-[var(--background)]">
                  <ScrollArea className="h-full">
                    <div className="p-6">
                      <Markdown content={highlightedContent} />
                    </div>
                  </ScrollArea>
                </div>
              </div>

              {/* AI Assistant Sidebar */}
              {rightSidebarVisible && (
                <div className="w-96 flex-none border-l border-[var(--border-color)] flex flex-col bg-[var(--background)]">
                  <div className="flex flex-col h-full">
                    {/* AI Panel Header */}
                    <div className="flex-none px-4 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
                      <div className="flex items-center">
                        <Bot className="w-4 h-4 text-[var(--accent)] mr-2" />
                        <h3 className="text-sm font-medium text-[var(--foreground)]">AI Assistant</h3>
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

                    {/* Chat History */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {chatHistory.map((chat, index) => (
                        <div key={index} className="space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-none">
                              <User className="w-4 h-4 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1 text-sm text-[var(--foreground)]">{chat.prompt}</div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-none">
                              <Bot className="w-4 h-4 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1 text-sm text-[var(--foreground)] whitespace-pre-wrap">{chat.response}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Input Area */}
                    <div className="flex-none p-6 border-t border-[var(--border-color)]">
                      <div className="flex gap-3">
                        <Textarea
                          value={llmPrompt}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLlmPrompt(e.target.value)}
                          placeholder="Ask the AI assistant..."
                          className="flex-1 min-h-[40px] max-h-32 border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20 bg-[var(--background)] text-[var(--foreground)] text-sm"
                        />
                        <Button
                          onClick={handleLlmSubmit}
                          disabled={!llmPrompt.trim() || isProcessing}
                          className="btn-japanese flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
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