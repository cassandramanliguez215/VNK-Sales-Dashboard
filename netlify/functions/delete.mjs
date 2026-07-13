// POST /.netlify/functions/delete  { id }  -> removes one uploaded batch's records
import { loadState, saveState, checkAuth, json } from '../lib/store.mjs';
import { aggregate } from '../lib/aggregate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!checkAuth(req)) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad request' }, 400); }
  const id = body && body.id;
  if (!id) return json({ error: 'missing id' }, 400);

  const state = await loadState();
  const keep = (arr) => (arr || []).filter(r => r._b !== id);
  state.salesRecords = keep(state.salesRecords);
  state.activityRecords = keep(state.activityRecords);
  state.leadRecords = keep(state.leadRecords);
  state.uploads = (state.uploads || []).filter(u => u.id !== id);
  await saveState(state);

  return json({ ok: true, data: aggregate(state, {}) });
};

export const config = { path: '/api/delete' };
