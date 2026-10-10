// GET /api/announcements            -> { latestId }            (where to start listening)
// GET /api/announcements?after=ID   -> { latestId, items: [] } (new announcements since ID)
// Responses are cached at the edge for 2 seconds so many players polling the
// same URL cost only one database read.
import { json, select, CORS } from './_supabase.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const cache = { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=1' };
  try {
    if (!params.has('after')) {
      const rows = await select('blockscraft_announcements?select=id&order=id.desc&limit=1');
      return json({ latestId: rows.length ? rows[0].id : 0 }, 200, cache);
    }
    const after = Math.max(0, Math.floor(Number(params.get('after')) || 0));
    // Only recent messages, so a player who reconnects much later isn't flooded.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const rows = await select(
      `blockscraft_announcements?select=id,message,created_at&id=gt.${after}` +
      `&created_at=gt.${encodeURIComponent(since)}&order=id.asc&limit=5`,
    );
    return json({ latestId: rows.length ? rows[rows.length - 1].id : after, items: rows }, 200, cache);
  } catch (e) {
    return json({ error: 'Announcements are unavailable right now.' }, 503);
  }
}
