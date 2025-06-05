"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Save, ChevronRight, Sparkles, Send, RefreshCw, PanelLeft, PanelRight,
  Bot, ChevronDown, ChevronUp, User, Quote, Check, X,
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
  sourceText?: string
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
  const [currentPageId, setCurrentPageId] = useState(pageId || "")
  const [highlightedRanges, setHighlightedRanges] = useState<Selection[]>([])
  const [proposedContent, setProposedContent] = useState<string | null>(null)
  const [originalContentForRevert, setOriginalContentForRevert] = useState<string | null>(null)
  const [wikiMatches, setWikiMatches] = useState<Selection[]>([])

  const router = useRouter()
  const searchParams = useSearchParams()

  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Sync currentPageId with pageId prop when it changes
  useEffect(() => {
    if (pageId && pageId !== currentPageId) {
      setCurrentPageId(pageId)
    }
  }, [pageId, currentPageId])

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
    if (!owner || !repo || targetPageId === currentPageId) return

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

      // Store the content in sessionStorage for the target page
      sessionStorage.setItem(`editPageContent_${targetPageId}`, newPageContent)
      
      // Navigate to the new page using Next.js router
      const queryParams = new URLSearchParams(searchParams?.toString())
      const queryString = queryParams.toString()
      const newUrl = `/${owner}/${repo}/edit/${targetPageId}${queryString ? `?${queryString}` : ''}`
      router.push(newUrl)

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

  const handleTextSelection = useCallback(() => {
    console.log('handleTextSelection called')
    if (editorRef.current) {
      const start = editorRef.current.selectionStart
      const end = editorRef.current.selectionEnd
      console.log('Selection range:', start, end)

      if (start !== end) {
        const selectedText = content.substring(start, end)
        
        // Check if selected text exactly matches any part of the wiki content
        const isExactMatch = content.includes(selectedText)
        
        if (isExactMatch) {
          setSelectedText({ 
            text: selectedText, 
            start, 
            end,
            sourceText: selectedText // Track that this is from the wiki
          })
        } else {
          setSelectedText({ text: selectedText, start, end })
        }

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

  // Helper function to merge overlapping ranges and prevent duplicates
  const mergeHighlightRanges = useCallback((ranges: Selection[], newRange: Selection): Selection[] => {
    // Check if the exact same range already exists
    const exactMatch = ranges.find(range => 
      range.start === newRange.start && range.end === newRange.end
    )
    if (exactMatch) {
      console.log('Exact range already exists, skipping:', newRange)
      return ranges
    }

    // Add the new range and sort by start position
    const allRanges = [...ranges, newRange].sort((a, b) => a.start - b.start)
    const merged: Selection[] = []

    for (const current of allRanges) {
      if (merged.length === 0) {
        merged.push(current)
        continue
      }

      const last = merged[merged.length - 1]
      
      // Check if current range overlaps with the last merged range
      if (current.start <= last.end) {
        // Merge overlapping ranges
        last.end = Math.max(last.end, current.end)
        last.text = content.substring(last.start, last.end)
      } else {
        // No overlap, add as new range
        merged.push(current)
      }
    }

    return merged
  }, [content])

  const addSelectedTextToPrompt = useCallback(() => {
    console.log('addSelectedTextToPrompt called')
    console.log('selectedText state:', selectedText)
    console.log('current llmPrompt:', llmPrompt)
    console.log('current highlightedRanges:', highlightedRanges)
    
    if (selectedText) {
      try {
        console.log('Adding selected text to prompt:', selectedText)
        // Note: No longer automatically adding to prompt, just highlighting for regeneration
        setFloatingButton({ visible: false, x: 0, y: 0 })
        
        // If this is a wiki match, add it to wikiMatches
        if (selectedText.sourceText) {
          setWikiMatches(prev => mergeHighlightRanges(prev, selectedText))
        }
        
        // Add to general highlighted ranges as before
        setHighlightedRanges(prev => mergeHighlightRanges(prev, selectedText))
        setSelectedText(null)
        
        if (editorRef.current) {
          editorRef.current.setSelectionRange(
            editorRef.current.selectionEnd,
            editorRef.current.selectionEnd
          )
        }
        console.log('addSelectedTextToPrompt completed successfully')
      } catch (error) {
        console.error('Error in addSelectedTextToPrompt:', error)
      }
    } else {
      console.log('No selectedText available')
    }
  }, [selectedText, highlightedRanges, llmPrompt, mergeHighlightRanges])

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
    if (!llmPrompt.trim() && wikiMatches.length === 0 && highlightedRanges.length === 0) return

    setIsProcessing(true)
    setLlmResponse("")

    try {
      const repoUrl = owner && repo ? `https://github.com/${owner}/${repo}` : "";

      // Build the highlighted content string (if any)
      const highlightedContent = highlightedRanges.length > 0
        ? highlightedRanges
            .map(range => content.substring(range.start, range.end))
            .join("\n\n-----\n\n") // delimiter between disjoint selections
        : undefined

      const requestBody: Record<string, any> = {
        repo_url: repoUrl,
        current_page_title: currentPageId || "Current Page",
        current_page_content: content,
        current_page_files: [],
        edit_request: llmPrompt,
      }

      // Only include highlighted_content when we actually have one – keeps the payload clean
      if (highlightedContent && highlightedContent.trim().length > 0) {
        requestBody.highlighted_content = highlightedContent
      }

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

      // Split response into suggestions and revised document
      const splitToken = "### Revised Document";
      const parts = completedText.split(splitToken);
      let suggestionsPart = completedText;
      let revisedPart = "";
      if (parts.length >= 2) {
        suggestionsPart = parts[0].trim();
        revisedPart = parts.slice(1).join(splitToken).trim();
        if (revisedPart.startsWith("###")) {
          revisedPart = revisedPart.replace(/^#+\s*/m, "");
        }

        // Preserve a snapshot of the content **before** applying any change so that
        // the user can still revert      
        const preEditContent = content;

        let nextContent = revisedPart;

        // If we originally sent `highlighted_content` then the LLM response may
        // contain **only** the edited selection(s) (some models ignore the
        // instruction to return the full document). When that happens we need to
        // stitch the edited chunks back into the original document ourselves so
        // that non-selected parts are preserved.
        if (highlightedContent && highlightedRanges.length > 0) {
          // Build an array of replacement chunks, keeping the same delimiter that
          // we sent to the backend so that multiple disjoint selections are handled.
          const replacements = highlightedRanges.length > 1
            ? revisedPart.split("\n\n-----\n\n")
            : [revisedPart];

          if (replacements.length === highlightedRanges.length) {
            // Start with the original page content and progressively splice in
            // each replacement while accounting for changes in string length.
            let assembled = preEditContent;
            let offset = 0;

            highlightedRanges.forEach((range, idx) => {
              const start = range.start + offset;
              const end = range.end + offset;
              const replacement = replacements[idx];
              assembled = assembled.slice(0, start) + replacement + assembled.slice(end);
              // Update offset so subsequent ranges stay accurate
              offset += replacement.length - (end - start);
            });

            nextContent = assembled;
          }
        }

        setProposedContent(nextContent);
        setOriginalContentForRevert(preEditContent);
        setContent(nextContent);

        // Reset highlighted ranges after a successful round-trip so they don't
        // leak into the next edit session
        if (highlightedRanges.length > 0) {
          setHighlightedRanges([])
        }

        setChatHistory(prev => [...prev, { prompt: llmPrompt, response: suggestionsPart }]);
        setLlmResponse(suggestionsPart);

        // Clear wiki matches after successful submission
        setWikiMatches([])
      }
    } catch (error) {
      console.error("Error submitting to LLM:", error)
    } finally {
      setIsProcessing(false)
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
        targetPageExists: !!cachedData?.generated_pages?.[currentPageId || '']
      })

      if (!cachedData?.generated_pages || !cachedData?.wiki_structure) {
        throw new Error('Invalid cache data structure: missing required fields')
      }

      // Update the specific page content
      const updatedPage = {
        ...cachedData.generated_pages[currentPageId || ''],
        content: content,
        updated_at: new Date().toISOString()
      }
      
      console.log('Updating page content:', {
        pageId: currentPageId,
        contentLength: content.length,
        hasExistingPage: !!cachedData.generated_pages[currentPageId || '']
      })

      cachedData.generated_pages[currentPageId || ''] = updatedPage

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
      if (currentPageId) {
        sessionStorage.setItem(`editPageContent_${currentPageId}`, content)
      }
      
      // Show success message
      alert("Content saved successfully!")
    } catch (err) {
      console.error('Error saving content:', err)
      alert(err instanceof Error ? err.message : 'Failed to save content')
    }
  }

  const handleAccept = async () => {
    if (!proposedContent) return;
    setProposedContent(null);
    setOriginalContentForRevert(null);
    setLlmResponse("");
    await handleSave();
  };

  const handleReject = () => {
    if (originalContentForRevert) {
      setContent(originalContentForRevert);
    }
    setProposedContent(null);
    setOriginalContentForRevert(null);
    setLlmResponse("");
  };

  // Helper function to filter out stale ranges
  const cleanStaleRanges = useCallback((ranges: Selection[]): Selection[] => {
    return ranges.filter(range => {
      // Remove ranges that are completely outside the current content
      if (range.start >= content.length || range.end > content.length || range.start >= range.end) {
        console.log('Removing stale range:', range)
        return false
      }
      
      // Optional: Check if the text still matches (in case content was edited extensively)
      const currentText = content.substring(range.start, range.end)
      if (currentText !== range.text) {
        console.log('Text mismatch for range, removing:', { expected: range.text, actual: currentText })
        return false
      }
      
      return true
    })
  }, [content])

  const highlightedContent = useMemo(() => {
    console.log('Computing highlighted content with', highlightedRanges.length, 'ranges')
    if (highlightedRanges.length === 0) return content

    // Clean up stale ranges first
    const validRanges = cleanStaleRanges(highlightedRanges)
    
    // Update the state if we removed any stale ranges
    if (validRanges.length !== highlightedRanges.length) {
      console.log('Cleaned up stale ranges, updating state')
      setHighlightedRanges(validRanges)
    }

    if (validRanges.length === 0) return content

    // Sort ranges to guarantee deterministic behaviour
    const ranges = [...validRanges].sort((a, b) => a.start - b.start)
    console.log('Sorted ranges:', ranges)

    let result = ""
    let cursor = 0

    ranges.forEach(({ start, end }) => {
      // Guard against stale indexes that might be outside the current bounds after edits
      if (start >= content.length) return
      const safeEnd = Math.min(end, content.length)
      
      // Skip if start equals or exceeds safeEnd
      if (start >= safeEnd) return

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
  }, [content, highlightedRanges, cleanStaleRanges])

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
            {proposedContent && (
              <>
                <button
                  onClick={handleAccept}
                  title="Accept changes"
                  className="p-2 rounded-md bg-green-600 hover:bg-green-700 text-white flex items-center justify-center"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleReject}
                  title="Reject changes"
                  className="p-2 rounded-md bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
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
                    currentPageId={currentPageId}
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
                  <h1 className="text-xl font-semibold text-[var(--foreground)]">{currentPageId || "Wiki Page"}</h1>
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
                      {/* Highlight controls */}
                      {highlightedRanges.length > 0 && (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                          <div className="flex items-center justify-between">
                                                         <span className="text-sm text-yellow-800 dark:text-yellow-200">
                               {highlightedRanges.length} text section{highlightedRanges.length > 1 ? 's' : ''} being regenerated
                             </span>
                            <button
                              onClick={() => setHighlightedRanges([])}
                              className="text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 px-2 py-1 rounded border border-yellow-300 dark:border-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-800 transition-colors"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <Textarea
                          value={llmPrompt}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLlmPrompt(e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (llmPrompt.trim() && !isProcessing) {
                                handleLlmSubmit();
                                setLlmPrompt(''); // Clear the input after sending
                              }
                            }
                          }}
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