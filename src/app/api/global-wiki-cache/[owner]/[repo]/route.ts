import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.STREAMING_API_BASE_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  try {
    const { owner, repo } = params;
    const { searchParams } = new URL(request.url);
    const queryParams = new URLSearchParams(searchParams);
    
    const response = await fetch(
      `${API_BASE_URL}/api/global_wiki_cache/${owner}/${repo}?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching global wiki cache: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to fetch global wiki cache' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in GET /api/global-wiki-cache/[owner]/[repo]:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch global wiki cache: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  try {
    const { owner, repo } = params;
    const { searchParams } = new URL(request.url);
    const queryParams = new URLSearchParams(searchParams);
    
    const response = await fetch(
      `${API_BASE_URL}/api/global_wiki_cache/${owner}/${repo}?${queryParams.toString()}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error deleting global wiki cache: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to delete global wiki cache' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in DELETE /api/global-wiki-cache/[owner]/[repo]:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to delete global wiki cache: ${message}` },
      { status: 500 }
    );
  }
} 