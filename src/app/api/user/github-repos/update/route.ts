import { NextRequest } from 'next/server';

const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`🚀 [${timestamp}] GitHub Repos Update API Route Called`);
  
  try {
    // Extract query parameters from the URL
    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    const github_username = url.searchParams.get('github_username');
    const github_token = url.searchParams.get('github_token');

    console.log(`📝 [${timestamp}] Request Parameters:`, {
      user_id: user_id || 'MISSING',
      github_username: github_username || 'MISSING',
      github_token: github_token ? 'PROVIDED' : 'NOT_PROVIDED',
      full_url: request.url
    });

    if (!user_id || !github_username) {
      console.error(`❌ [${timestamp}] Missing required parameters - user_id: ${user_id}, github_username: ${github_username}`);
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
      ...(github_token && { github_token })
    });

    const backend_url = `${SERVER_BASE_URL}/api/user/github-repos/update?${params.toString()}`;
    console.log(`🔄 [${timestamp}] Proxying request to backend:`, backend_url);

    const response = await fetch(backend_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [${timestamp}] Backend response status:`, response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [${timestamp}] Backend error - Status: ${response.status}, Body: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Backend error: ${response.status}` }),
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    console.log(`✅ [${timestamp}] Backend response data:`, data);
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`💥 [${timestamp}] Error in GitHub repos update API:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 