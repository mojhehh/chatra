/**
 * Cloudflare Worker for Google Custom Search Engine (CSE)
 * Securely handles web search requests
 */

const GOOGLE_API_KEY = 'AIzaSyASLs2SO1wkYn2NTCJvVuLaWdecgjE7HJU';
const CSE_ID = '5177a9432d0184383';

const ALLOWED_ORIGINS = [
  'https://chat-app-710f0.web.app',
  'https://chat-app-710f0.firebaseapp.com',
  'https://mojhehh.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call Google CSE API
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('cx', CSE_ID);
    searchUrl.searchParams.append('key', GOOGLE_API_KEY);
    searchUrl.searchParams.append('num', '10'); // Return 10 results

    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      console.error('Google CSE API error:', response.status, response.statusText);
      return new Response(JSON.stringify({ error: 'Search failed' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    // Transform results for frontend
    const results = (data.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink
    }));

    return new Response(JSON.stringify({ query, results, total: data.queries?.request?.[0]?.totalResults || 0 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
