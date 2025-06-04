import { NextRequest } from 'next/server';

const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    const response = await fetch(
      `${SERVER_BASE_URL}/api/user/github-repos/status/${userId}`,
      {
        method: 'GET',
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
    console.error('Error in GitHub repos status API:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 