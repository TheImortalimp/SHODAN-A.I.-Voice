// Endpoint validation for the optional AI link. Only loopback hosts are allowed so typed
// text stays on this machine; this mirrors the connect-src list in csp.js.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export function validateEndpoint(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return { ok: false, reason: 'Not a valid URL. Example: http://localhost:11434/v1' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'Only http:// or https:// endpoints are allowed.' };
  if (url.username || url.password) return { ok: false, reason: 'Credentials inside URLs are blocked. Use the API key field.' };
  if (url.search || url.hash) return { ok: false, reason: 'Query strings and fragments are not allowed in the endpoint.' };
  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    return { ok: false, reason: 'WHITE ICE only allows loopback AI endpoints (localhost or 127.0.0.1) so your text never leaves this device.' };
  }
  const path = url.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${url.origin}${path}`, host };
}

export function joinEndpoint(base, path) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
