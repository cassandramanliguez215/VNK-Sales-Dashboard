// GET /.netlify/functions/data?from=&to=  ->  aggregated dashboard data
import { loadState, checkAuth, authRequired, json } from '../lib/store.mjs';
import { aggregate } from '../lib/aggregate.mjs';

export default async (req) => {
  if (!checkAuth(req)) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const state = await loadState();
  return json({
    authRequired: authRequired(),
    data: aggregate(state, { from, to }),
  });
};

export const config = { path: '/api/data' };
