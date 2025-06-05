import { NextRequest, NextResponse } from 'next/server'

// Base URL for the Python backend
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:8001'

/**
 * Proxy POST /api/wiki/edit/suggestions →  BACKEND /wiki/edit/suggestions  (streaming)
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text() // keep original JSON string

    const targetUrl = `${SERVER_BASE_URL}/wiki/edit/suggestions`

    const backendResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: rawBody,
    })

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.text()
      return new NextResponse(errorBody, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
      })
    }

    if (!backendResponse.body) {
      return new NextResponse('Stream body from backend is null', { status: 500 })
    }

    // Pipe the streaming body back to the client unchanged
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body!.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
        } catch (err) {
          console.error('Error reading backend stream:', err)
          controller.error(err)
        } finally {
          controller.close()
          reader.releaseLock()
        }
      },
    })

    const responseHeaders = new Headers()
    const contentType = backendResponse.headers.get('Content-Type')
    if (contentType) responseHeaders.set('Content-Type', contentType)
    responseHeaders.set('Cache-Control', 'no-cache, no-transform')

    return new NextResponse(stream, {
      status: backendResponse.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Error in /api/wiki/edit/suggestions proxy:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Allow CORS pre-flight if ever needed
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
} 