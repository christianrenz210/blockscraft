// Server-side helpers for the BlocksCraft API. The Supabase key lives only in
// Vercel environment variables (SUPABASE_URL, SUPABASE_KEY), never in the game.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  });
}

function config() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Server is not configured');
  return { url, key };
}

export async function select(path) {
  const { url, key } = config();
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key } });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

export async function rpc(fn, args) {
  const { url, key } = config();
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}
