import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.STREAMING_API_BASE_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams(searchParams);
    
    const response = await fetch(`${API_BASE_URL}/api/global_wiki_cache?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching global wiki caches: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to fetch global wiki caches' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in GET /api/global-wiki-cache:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch global wiki caches: ${message}` },
      { status: 500 }
    );
  }
} 