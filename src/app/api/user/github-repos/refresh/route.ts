import { NextRequest } from 'next/server';

const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    // Extract query parameters from the URL
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const github_username = url.searchParams.get('github_username');
    const github_token = url.searchParams.get('github_token');
    const force = url.searchParams.get('force');

    if (!user_id || !github_username) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: user_id and github_username' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Create query parameters for backend request
    const params = new URLSearchParams({
      user_id,
      github_username,
      ...(github_token && { github_token }),
      ...(force && { force })
    });

    const response = await fetch(
      `${SERVER_BASE_URL}/api/user/github-repos/refresh?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Backend error: ${response.status}` }),
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in GitHub repos refresh API:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 