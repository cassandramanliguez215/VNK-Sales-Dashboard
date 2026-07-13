// POST /.netlify/functions/upload
//   { kind: 'csv' | 'activity' | 'lead', filename, contentBase64 }
// Parses the file, merges records into the store, returns fresh aggregated data.
import { loadState, saveState, checkAuth, authRequired, json } from '../lib/store.mjs';
import { aggregate } from '../lib/aggregate.mjs';
import { parseCsv, parseActivityPdf, parseLeadPdf } from '../lib/parse.mjs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!checkAuth(req)) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await req.json(); } catch (_) { return json({ error: 'bad request' }, 400); }
  const { kind, filename, contentBase64 } = body || {};
  if (!kind || !contentBase64) return json({ error: 'missing kind or file' }, 400);

  const buf = Buffer.from(contentBase64, 'base64');
  const state = await loadState();
  const batchId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let added = 0;
  let summary = '';

  try {
    if (kind === 'csv') {
      const text = buf.toString('utf-8');
      const rows = parseCsv(text).map(r => ({ ...r, _b: batchId }));
      state.salesRecords.push(...rows);
      added = rows.length;
      const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
      summary = `${rows.length} transactions · $${total.toLocaleString()}`;
    } else if (kind === 'activity') {
      const parsed = await pdfParse(buf);
      const { rep, period, activities } = parseActivityPdf(parsed.text || '');
      state.activityRecords.push(...activities.map(a => ({ ...a, _b: batchId })));
      added = activities.length;
      summary = `${activities.length} activities · ${rep}${period.from ? ` · ${period.from}–${period.to}` : ''}`;
    } else if (kind === 'lead') {
      const parsed = await pdfParse(buf);
      const { rep, leads } = parseLeadPdf(parsed.text || '');
      state.leadRecords.push(...leads.map(l => ({ ...l, _b: batchId })));
      added = leads.length;
      summary = `${leads.length} leads · ${rep}`;
    } else {
      return json({ error: 'unknown kind' }, 400);
    }
  } catch (e) {
    return json({ error: 'parse failed: ' + (e && e.message || 'unknown') }, 422);
  }

  state.uploads.push({ id: batchId, kind, filename: filename || '(file)', at: new Date().toISOString(), added, summary });
  await saveState(state);

  return json({
    ok: true, added, summary,
    authRequired: authRequired(),
    data: aggregate(state, {}),
  });
};

export const config = { path: '/api/upload' };
