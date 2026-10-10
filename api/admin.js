// POST /api/admin  { action: 'login' | 'announce' | 'password', username, password, message?, newPassword? }
// The password is checked inside the database on every request (bcrypt hash,
// with a limit on failed attempts), so nothing secret is stored here.
import { json, rpc, CORS } from './_supabase.js';

const ERRORS = {
  invalid_login: [401, 'Wrong username or password.'],
  too_many_attempts: [429, 'Too many failed logins. Try again in 10 minutes.'],
  bad_message: [400, 'The message must be 1 to 300 characters.'],
  weak_password: [400, 'The new password must be at least 8 characters.'],
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }
  const username = String(body.username || '').slice(0, 50);
  const password = String(body.password || '').slice(0, 200);
  if (!username || !password) return json({ error: 'Enter your username and password.' }, 400);

  try {
    let status;
    if (body.action === 'login') {
      status = await rpc('blockscraft_admin_login', { p_username: username, p_password: password });
    } else if (body.action === 'announce') {
      status = await rpc('blockscraft_post_announcement', {
        p_username: username, p_password: password, p_message: String(body.message || '').slice(0, 1000),
      });
    } else if (body.action === 'password') {
      status = await rpc('blockscraft_change_password', {
        p_username: username, p_password: password, p_new_password: String(body.newPassword || '').slice(0, 200),
      });
    } else {
      return json({ error: 'Unknown action.' }, 400);
    }
    if (status === 'ok') return json({ ok: true });
    const [code, message] = ERRORS[status] || [500, 'Something went wrong.'];
    return json({ error: message }, code);
  } catch (e) {
    return json({ error: 'The server could not be reached. Try again.' }, 503);
  }
}
