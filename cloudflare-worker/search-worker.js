/**
 * Cloudflare Worker for Google Custom Search Engine (CSE)
 * Securely handles web search requests with image support
 */

// Get API key from environment secrets
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyASLs2SO1wkYn2NTCJvVuLaWdecgjE7HJU';
const CSE_ID = '5177a9432d0184383';

const ALLOWED_ORIGINS = [
  'https://chat-app-710f0.web.app',
  'https://chat-app-710f0.firebaseapp.com',
  'https://mojhehh.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    'Access-Control-Allow-Origin': allowedOrigin || ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const corsHeaders = getCorsHeaders(request);
  const origin = request.headers.get('Origin');
  
  // Reject requests from disallowed origins
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    const { query, searchImages } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call Google CSE API
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('cx', CSE_ID);
    searchUrl.searchParams.set('key', GOOGLE_API_KEY);
    searchUrl.searchParams.set('num', '10'); // Return 10 results
    
    // If image search requested, set searchType=image
    if (searchImages === true) {
      searchUrl.searchParams.set('searchType', 'image');
      searchUrl.searchParams.set('num', '20'); // More images (replaces default)
    }

    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      console.error('Google CSE API error:', response.status, response.statusText);
      return new Response(JSON.stringify({ error: 'Search failed', status: response.status }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    // Transform results for frontend
    let results = [];
    
    if (searchImages) {
      // Image search results
      results = (data.items || []).map(item => ({
        title: item.title,
        link: item.link,
        image: item.image?.thumbnailLink || item.image?.link,
        source: item.displayLink,
        originalImage: item.image?.contextLink
      }));
    } else {
      // Web search results
      results = (data.items || []).map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink,
        image: item.pagemap?.cse_image?.[0]?.src // Include image if available
      }));
    }

    return new Response(JSON.stringify({ 
      query, 
      results, 
      total: data.queries?.request?.[0]?.totalResults || 0,
      searchType: searchImages ? 'image' : 'web'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
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
