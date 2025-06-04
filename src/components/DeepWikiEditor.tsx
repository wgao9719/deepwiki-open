"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Save, Home, ChevronDown, ChevronRight, Sparkles, Send, RefreshCw, PanelLeft, PanelRight,
} from "lucide-react"

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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    architecture: false,
  })
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true)
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true)

  const editorRef = useRef<HTMLTextAreaElement>(null)

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

      // Also update sessionStorage for immediate viewing
      sessionStorage.setItem("editPageContent", content)
      
      // Show success message
      alert("Content saved successfully!")
    } catch (err) {
      console.error('Error saving content:', err)
      alert(err instanceof Error ? err.message : 'Failed to save content')
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-violet-500 hover:text-violet-600 hover:bg-violet-50"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <h1 className="text-xl font-semibold text-gray-900">DeepWiki Editor</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={handleSave} className="bg-violet-500 hover:bg-violet-600 text-white">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar */}
        {leftSidebarVisible && (
          <div className="w-64 bg-white flex flex-col border-r border-gray-100">
            {/* Left Sidebar Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{repo ?? "Wiki"}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeftSidebarVisible(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <PanelLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Left Sidebar Content */}
            <div className="flex-1 p-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Pages</h3>
                <div className="space-y-1">
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start p-2 h-auto text-gray-700 hover:bg-gray-50"
                      onClick={() => toggleSection("overview")}
                    >
                      {expandedSections.overview ? (
                        <ChevronDown className="w-4 h-4 mr-1" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mr-1" />
                      )}
                      Overview
                    </Button>
                    {expandedSections.overview && (
                      <div className="ml-5 space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-violet-600 bg-violet-50 hover:bg-violet-100"
                        >
                          <span className="w-2 h-2 bg-violet-500 rounded-full mr-2"></span>
                          Project Overview
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-gray-500 hover:bg-gray-50"
                        >
                          <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                          Architecture Overview
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start p-2 h-auto text-gray-700 hover:bg-gray-50"
                      onClick={() => toggleSection("architecture")}
                    >
                      {expandedSections.architecture ? (
                        <ChevronDown className="w-4 h-4 mr-1" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mr-1" />
                      )}
                      Architecture
                    </Button>
                    {expandedSections.architecture && (
                      <div className="ml-5 space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-gray-500 hover:bg-gray-50"
                        >
                          <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                          Backend Systems
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-gray-500 hover:bg-gray-50"
                        >
                          <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                          Deployment and Infrastructure
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Editor and AI Assistant */}
        <div className="flex-1 bg-white flex">
          {/* Unified Header */}
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-gray-100">
              {/* Editor Header */}
              <div className="flex-1 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">{pageId || "Wiki Page"}</h1>
                    <div className="flex items-center text-sm text-gray-600">
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
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <PanelLeft className="w-4 h-4" />
                      </Button>
                    )}
                    {!rightSidebarVisible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRightSidebarVisible(true)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <PanelRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Assistant Header */}
              {rightSidebarVisible && (
                <div className="w-96 px-6 py-4 border-l border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Sparkles className="w-5 h-5 text-violet-500 mr-2" />
                      <h3 className="text-lg font-semibold text-gray-900">AI Assistant</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRightSidebarVisible(false)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <PanelRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex">
              {/* Editor Content */}
              <div className="flex-1">
                <ScrollArea className="h-full">
                  <Textarea
                    ref={editorRef}
                    value={content}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                    onSelect={handleTextSelection}
                    className="min-h-[600px] border-none resize-none focus:ring-0 text-gray-800 leading-relaxed p-6 bg-white"
                    placeholder="Start editing your documentation..."
                  />
                </ScrollArea>
              </div>

              {/* AI Assistant Content */}
              {rightSidebarVisible && (
                <div className="w-96 border-l border-gray-100 flex flex-col">
                  <div className="flex-1 p-6 flex flex-col">
                    {selectedText && (
                      <div className="mb-4 p-3 bg-violet-50 rounded-lg border border-violet-200">
                        <p className="text-sm text-violet-700 font-medium mb-1">Selected Text:</p>
                        <p className="text-sm text-gray-700 italic">"{selectedText.text}"</p>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-2">Prompt for AI Assistant</label>
                      <Textarea
                        value={llmPrompt}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLlmPrompt(e.target.value)}
                        placeholder="Select text in the editor or type your own prompt..."
                        className="flex-1 mb-4 min-h-[120px] border-gray-200 focus:border-violet-300 focus:ring-violet-200"
                      />

                      <Button
                        onClick={handleLlmSubmit}
                        disabled={!llmPrompt.trim() || isProcessing}
                        className="mb-4 bg-violet-500 hover:bg-violet-600 text-white"
                      >
                        {isProcessing ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        {isProcessing ? "Processing..." : "Send to AI"}
                      </Button>

                      {llmResponse && (
                        <div className="flex-1 flex flex-col">
                          <label className="text-sm font-medium text-gray-700 mb-2">AI Response</label>
                          <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4 overflow-auto">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{llmResponse}</p>
                          </div>

                          {selectedText && (
                            <Button
                              onClick={applyLlmSuggestion}
                              variant="outline"
                              className="border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300"
                            >
                              Apply Suggestion
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white px-6 py-3">
        <div className="flex items-center justify-end text-sm text-gray-400">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
            <span className="sr-only">Toggle theme</span>🌙
          </Button>
        </div>
      </footer>
    </div>
  )
} 