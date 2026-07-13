// Turn raw records (sales / activities / leads) into the shape the dashboard renders.
import { canonicalRep, canonicalVendor } from './parse.mjs';

const REP_ROSTER = [
  'Vincent Ramos', 'Mylynna Ramos', 'Elizabeth Loggie',
  'Bailey Bryan', 'Tyler Bures', 'Zachary Manasan',
];

const fmtK = (n) => '$' + (Math.round(n / 100) / 10).toFixed(1) + 'K';

function parseDate(s) {
  if (!s) return null;
  // Accept MM/DD/YYYY or YYYY-MM-DD
  let m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function within(dateStr, from, to) {
  if (!from && !to) return true;
  const d = parseDate(dateStr);
  if (!d) return true;
  if (from && d < parseDate(from)) return false;
  if (to && d > parseDate(to)) return false;
  return true;
}

export function aggregate(state, filter = {}) {
  const { from, to } = filter;
  const sales = (state.salesRecords || []).filter(r => within(r.date, from, to));
  const acts = (state.activityRecords || []).filter(r => within(r.date, from, to));
  const leads = (state.leadRecords || []).filter(r => within(r.date, from, to));

  const totalSales = sales.reduce((s, r) => s + (r.amount || 0), 0);
  const tx = sales.length;
  const avg = tx ? totalSales / tx : 0;

  // Reps
  const repMap = {};
  const ensureRep = (name) => {
    const n = canonicalRep(name) || 'Unknown';
    if (!repMap[n]) repMap[n] = { name: n, sales: 0, deals: 0, activities: 0, leads: 0 };
    return repMap[n];
  };
  REP_ROSTER.forEach(ensureRep);
  sales.forEach(r => { const x = ensureRep(r.rep); x.sales += r.amount || 0; x.deals += 1; });
  acts.forEach(r => { ensureRep(r.rep).activities += 1; });
  leads.forEach(r => { ensureRep(r.rep).leads += 1; });
  const reps = Object.values(repMap).sort((a, b) => b.sales - a.sales || b.activities - a.activities);
  const maxRepSales = Math.max(1, ...reps.map(r => r.sales));

  // Vendors — sales $ plus activity mentions
  const venMap = {};
  const ensureVen = (name) => {
    const n = canonicalVendor(name);
    if (!n) return null;
    if (!venMap[n]) venMap[n] = { name: n, amount: 0, deals: 0, mentions: 0 };
    return venMap[n];
  };
  sales.forEach(r => { const v = ensureVen(r.vendor); if (v) { v.amount += r.amount || 0; v.deals += 1; } });
  acts.forEach(r => { const v = ensureVen(r.vendor); if (v) v.mentions += 1; });
  const vendors = Object.values(venMap).sort((a, b) => b.amount - a.amount || b.mentions - a.mentions);
  const vendorTotal = vendors.reduce((s, v) => s + v.amount, 0) || 1;

  // Territories
  const terrMap = {};
  sales.forEach(r => {
    const t = (r.territory || 'Unspecified').trim() || 'Unspecified';
    terrMap[t] = (terrMap[t] || 0) + (r.amount || 0);
  });
  const territories = Object.entries(terrMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const terrTotal = territories.reduce((s, t) => s + t.amount, 0) || 1;

  // Recent transactions
  const recent = [...sales].sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0)).slice(0, 8);

  // Monthly series ($K) for the latest year present
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const salesDated = sales.map(r => ({ r, d: parseDate(r.date) })).filter(x => x.d);
  const seriesYear = salesDated.length ? Math.max(...salesDated.map(x => x.d.getFullYear())) : new Date().getFullYear();
  const buckets = new Array(12).fill(0);
  salesDated.forEach(x => { if (x.d.getFullYear() === seriesYear) buckets[x.d.getMonth()] += (x.r.amount || 0); });
  const series = buckets.map((v, i) => ({ label: MONTHS[i], value: Math.round(v / 100) / 10 }));

  // Month-to-date (latest month present in data)
  const dated = sales.map(r => ({ r, d: parseDate(r.date) })).filter(x => x.d);
  let mtd = 0;
  if (dated.length) {
    const latest = dated.reduce((a, b) => (a.d > b.d ? a : b)).d;
    mtd = dated.filter(x => x.d.getFullYear() === latest.getFullYear() && x.d.getMonth() === latest.getMonth())
               .reduce((s, x) => s + (x.r.amount || 0), 0);
  }

  return {
    updatedAt: state.updatedAt || null,
    uploads: (state.uploads || []).slice(-10).reverse(),
    metrics: {
      totalSales, totalSalesLabel: fmtK(totalSales),
      tx, avg, avgLabel: fmtK(avg),
      mtd, mtdLabel: fmtK(mtd),
      repCount: reps.filter(r => r.sales > 0 || r.activities > 0 || r.leads > 0).length,
      vendorCount: vendors.length,
      activityCount: acts.length,
      leadCount: leads.length,
    },
    reps: reps.map(r => ({
      ...r, salesLabel: fmtK(r.sales),
      pct: Math.round((r.sales / maxRepSales) * 100) + '%',
    })),
    vendors: vendors.map(v => ({
      ...v, amountLabel: fmtK(v.amount),
      share: Math.round((v.amount / vendorTotal) * 100),
    })),
    territories: territories.map(t => ({
      ...t, amountLabel: fmtK(t.amount),
      pct: Math.round((t.amount / terrTotal) * 100) + '%',
    })),
    recent: recent.map(r => ({
      rep: r.rep, vendor: r.vendor, customer: r.customer,
      date: r.date, amount: r.amount, amountLabel: fmtK(r.amount),
    })),
    leads: leads.slice(0, 50).map(l => ({
      name: l.client, rep: l.rep, vendor: l.vendor,
      meta: [l.territory, l.rep].filter(Boolean).join(' · '), date: l.date,
    })),
    activityByRep: reps.map(r => ({ name: r.name, activities: r.activities })),
    series, seriesYear,
  };
}
