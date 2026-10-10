// Online features: receiving admin announcements and the admin panel's API.
// Talks to the website's API (which holds the database key), so it works the
// same from the website, a local server and the Android app.
const API = 'https://blockscraft.vercel.app/api';

let lastId = null;
let started = false;

// Checks for new announcements every few seconds and calls onMessage(text, time)
// for each one. Messages sent before the game was opened are skipped.
export function listenForAnnouncements(onMessage) {
  if (started) return;
  started = true;
  const poll = async () => {
    try {
      const url = lastId === null ? `${API}/announcements` : `${API}/announcements?after=${lastId}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (lastId !== null) for (const a of data.items || []) onMessage(a.message, a.created_at);
        if (typeof data.latestId === 'number') lastId = Math.max(lastId ?? 0, data.latestId);
      }
    } catch (e) { /* offline: try again later */ }
    setTimeout(poll, document.hidden ? 15000 : 3000);
  };
  poll();
}

async function admin(action, fields) {
  let r;
  try {
    r = await fetch(`${API}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...fields }),
    });
  } catch (e) {
    throw new Error('No internet connection.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export const adminLogin = (username, password) => admin('login', { username, password });
export const sendAnnouncement = (username, password, message) => admin('announce', { username, password, message });
export const changeAdminPassword = (username, password, newPassword) => admin('password', { username, password, newPassword });
