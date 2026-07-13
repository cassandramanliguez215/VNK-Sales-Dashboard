// POST /.netlify/functions/reset  -> clears all stored data (auth required)
import { resetState, checkAuth, json } from '../lib/store.mjs';
import { aggregate } from '../lib/aggregate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!checkAuth(req)) return json({ error: 'unauthorized' }, 401);
  const state = await resetState();
  return json({ ok: true, data: aggregate(state, {}) });
};

export const config = { path: '/api/reset' };
