// Parsers for the V&K Group dashboard backend.
// - parseCsv:   sales transactions (Date, Sales Rep, Vendor, Amount, Customer, Territory)
// - parseActivityPdf / parseLeadPdf: text extracted from New Generation Reps CRM PDFs
//
// PDF text extraction is inherently fuzzy — these parsers are defensive and always
// return partial results. Tune the KNOWN_* lists and regexes against real files.

// ---- Reference vocab (extend as needed) ----
export const KNOWN_VENDORS = [
  'Arc Cardinal', 'Arc Excalibur', 'Arc', 'Zafferano', 'Mepra', 'On the Table',
  'Pura Sangre', 'Vista Alegre', 'Risolli', 'Helios', 'Brighton', 'Casa Delfin',
  'Viejo Valle', 'Vertex China', 'Vertex', 'Sunnex', 'Ariane', 'Turgla',
  'Packnwood', 'Eurodib', 'Ed Don', 'Steelite', 'Libbey',
];

const CATEGORIES = ['Sales Call', 'Showroom', 'Phone Call', 'Email', 'Sample', 'Follow Up', 'Meeting', 'Other'];
const SEGMENTS = ['Hotel', 'Country Club', 'Restaurant', 'Casino', 'Resort', 'Dealer / Distributor', 'Dealer/Distributor', 'Catering', 'Bar', 'Golf Course'];

const REP_NAMES = [
  'Vincent Ramos', 'Vince Ramos', 'Mylynna Ramos', 'Elizabeth Loggie',
  'Bailey Bryan', 'Tyler Bures', 'Zachary Manasan',
];

// Canonicalise a few variants
export function canonicalVendor(v) {
  if (!v) return v;
  if (/arc\s*(cardinal|excalibur)?/i.test(v)) return 'Arc Cardinal';
  if (/^vertex/i.test(v)) return 'Vertex China';
  return v;
}
export function canonicalRep(name) {
  if (!name) return name;
  if (/^vince(nt)? ramos/i.test(name)) return 'Vincent Ramos';
  return name.replace(/\s+/g, ' ').trim();
}

// ---------- CSV ----------
// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas).
function csvRows(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function normHeader(h) { return h.toLowerCase().replace(/[^a-z]/g, ''); }

export function parseCsv(text) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map(normHeader);
  const idx = (names) => {
    for (const n of names) { const k = header.indexOf(n); if (k !== -1) return k; }
    return -1;
  };
  const iDate = idx(['date']);
  const iRep = idx(['salesrep', 'rep', 'salesperson']);
  const iVendor = idx(['vendor', 'factory', 'brand']);
  const iAmount = idx(['amount', 'total', 'sales', 'value']);
  const iCust = idx(['customer', 'client', 'account']);
  const iTerr = idx(['territory', 'region', 'market']);

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rawAmt = iAmount >= 0 ? (cells[iAmount] || '') : '';
    const amount = Number(String(rawAmt).replace(/[^0-9.\-]/g, '')) || 0;
    if (!amount && !(cells[iRep] || cells[iVendor])) continue;
    records.push({
      date: (iDate >= 0 ? cells[iDate] : '').trim(),
      rep: canonicalRep((iRep >= 0 ? cells[iRep] : '').trim()),
      vendor: canonicalVendor((iVendor >= 0 ? cells[iVendor] : '').trim()),
      amount,
      customer: (iCust >= 0 ? cells[iCust] : '').trim(),
      territory: (iTerr >= 0 ? cells[iTerr] : '').trim(),
    });
  }
  return records;
}

// ---------- PDF helpers ----------
function findRep(text) {
  // Header: "Activity Report/Call Log | Zachary | Week 26 2026"
  // Body:   "Zachary Manasan - Oklahoma Territory"
  for (const full of REP_NAMES) {
    if (text.includes(full)) return canonicalRep(full);
  }
  const m = text.match(/Call Log\s*\|\s*([A-Za-z]+)\s*\|/);
  if (m) {
    const first = m[1].trim();
    const full = REP_NAMES.find(n => n.toLowerCase().startsWith(first.toLowerCase()));
    if (full) return canonicalRep(full);
    return first;
  }
  return 'Unknown';
}

function findPeriod(text) {
  const m = text.match(/from\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (m) return { from: m[1], to: m[2] };
  return { from: '', to: '' };
}

function firstMatch(hay, list) {
  for (const item of list) {
    const re = new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\/\s*/g, '\\s*/\\s*'), 'i');
    if (re.test(hay)) return item.replace(/\s*\/\s*/g, ' / ');
  }
  return '';
}

// Split the document into activity chunks keyed by a leading date, and pull
// rep / vendor / category / segment / a short note snippet from each chunk.
function extractActivities(text, rep) {
  const activities = [];
  // Each activity row starts with a date like 04/17/2026 followed by a client name.
  const dateRe = /(\d{2}\/\d{2}\/\d{4})/g;
  const marks = [];
  let m;
  while ((m = dateRe.exec(text)) !== null) marks.push({ date: m[1], i: m.index });

  for (let k = 0; k < marks.length; k++) {
    const start = marks[k].i;
    const end = k + 1 < marks.length ? marks[k + 1].i : Math.min(start + 900, text.length);
    const chunk = text.slice(start, end);
    // Skip "Created ... at HH:MM:SS" timestamps that also match the date pattern
    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/.test(chunk)) continue;

    const vendor = canonicalVendor(firstMatch(chunk, KNOWN_VENDORS));
    const category = firstMatch(chunk, CATEGORIES) || 'Activity';
    const segment = firstMatch(chunk, SEGMENTS);
    // Client = the run of Title-Case words right after the date
    const cm = chunk.match(/\d{2}\/\d{2}\/\d{4}\s+([A-Z][A-Za-z'&.,-]+(?:\s+[A-Z0-9][A-Za-z'&.,-]*){0,6})/);
    const client = cm ? cm[1].replace(/\s+/g, ' ').trim() : '';
    const note = chunk.replace(/\s+/g, ' ').slice(0, 180).trim();

    activities.push({ date: marks[k].date, rep, client, vendor, category, segment, note });
  }
  return activities;
}

export function parseActivityPdf(text) {
  const rep = findRep(text);
  const period = findPeriod(text);
  const activities = extractActivities(text, rep).map(a => ({ ...a, kind: 'activity' }));
  return { rep, period, activities };
}

// Lead reports share the CRM layout — treat matched rows as leads.
// Tune once a real lead PDF is available.
export function parseLeadPdf(text) {
  const rep = findRep(text);
  const period = findPeriod(text);
  const leads = extractActivities(text, rep).map(a => ({
    kind: 'lead', date: a.date, rep, client: a.client || 'New opportunity',
    vendor: a.vendor, segment: a.segment, territory: '', note: a.note,
  }));
  return { rep, period, leads };
}
