// POST /.netlify/functions/login  { password }  ->  { token } | 401
import { tokenFor, isValidPassword, authRequired, json } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  if (!authRequired()) return json({ token: 'open', authRequired: false });

  let body = {};
  try { body = await req.json(); } catch (_) {}
  const password = (body.password || '').trim();
  if (!isValidPassword(password)) return json({ error: 'Invalid password' }, 401);
  return json({ token: tokenFor(password), authRequired: true });
};

export const config = { path: '/api/login' };
