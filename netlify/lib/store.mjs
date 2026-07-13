// Shared store (Netlify Blobs) + simple shared-password auth.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const STORE = 'vk-dashboard';
const KEY = 'state.json';

const EMPTY = { salesRecords: [], activityRecords: [], leadRecords: [], uploads: [], updatedAt: null };

export async function loadState() {
  try {
    const store = getStore(STORE);
    const data = await store.get(KEY, { type: 'json' });
    return data ? { ...EMPTY, ...data } : { ...EMPTY };
  } catch (e) {
    return { ...EMPTY };
  }
}

export async function saveState(state) {
  const store = getStore(STORE);
  state.updatedAt = new Date().toISOString();
  await store.setJSON(KEY, state);
  return state;
}

export async function resetState() {
  const store = getStore(STORE);
  await store.setJSON(KEY, { ...EMPTY });
  return { ...EMPTY };
}

// ---- Auth ----
// Multiple accepted passwords, all granting full access.
// Token = sha256(password); the plaintext only travels once, at login.
//
// Defaults are baked in so no Netlify env var is required:
//   NGRBailey     → shared password for all sales reps
//   NGRCassandra  → admin (Cassandra)
// You can still override the whole list with the DASHBOARD_PASSWORDS env var
// (comma-separated), e.g. "NGRBailey,NGRCassandra,NGRVince".
const DEFAULT_PASSWORDS = ['NGRBailey', 'NGRCassandra'];

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function passwords() {
  const env = process.env.DASHBOARD_PASSWORDS || process.env.DASHBOARD_PASSWORD || '';
  const list = env.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_PASSWORDS;
}

// Auth is always on here (there is always at least the default list).
export function authRequired() { return passwords().length > 0; }

// Kept for compatibility with callers; true when any password is configured.
export function expectedToken() { return authRequired() ? true : null; }

export function tokenFor(password) { return sha(password); }

export function isValidPassword(password) {
  return passwords().includes(String(password));
}

export function isValidToken(token) {
  if (!token) return false;
  return passwords().some(pw => sha(pw) === token);
}

export function checkAuth(req) {
  if (!authRequired()) return true;
  const token = req.headers.get('x-auth-token') || '';
  return isValidToken(token);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
