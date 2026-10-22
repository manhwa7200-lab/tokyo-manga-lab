// Image-load reports that MangaDex asks every client to send for images served from its network.
// Reports carry only the image URL and timing, never your account, library or reading history.
// Fire-and-forget: a failed report must never affect reading.
const REPORT_URL = 'https://api.mangadex.network/report';
const MAX_IN_FLIGHT = 4;
let inFlight = 0;

export function buildReport({ url, success, cached = false, bytes = 0, duration = 0 }) {
  return {
    url: String(url),
    success: Boolean(success),
    cached: Boolean(cached),
    bytes: success ? Math.max(0, Math.round(Number(bytes) || 0)) : 0,
    duration: Math.max(0, Math.round(Number(duration) || 0))
  };
}

export async function sendReport(entry) {
  if (inFlight >= MAX_IN_FLIGHT) return false; // Drop rather than queue: reports are best-effort.
  inFlight += 1;
  try {
    await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReport(entry)),
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    return true;
  } catch {
    return false;
  } finally {
    inFlight -= 1;
  }
}
