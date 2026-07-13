# V&K Group Sales Dashboard — Deploy Guide

A static dashboard (`public/index.html`) plus a small Netlify Functions backend that
parses your uploads, stores them (Netlify Blobs), and serves live data to the dashboard.

The dashboard also runs in **Demo mode** with sample data when no backend is reachable —
so it always looks right, and switches to **Live data** automatically once deployed.

---

## What each upload does

| Upload | Feeds | Notes |
|---|---|---|
| **Sales CSV** | Total sales, avg deal, leaderboard $, vendor mix, territories, recent transactions | Columns: `Date, Sales Rep, Vendor, Amount, Customer, Territory` |
| **Activity report (PDF)** | Activity counts per rep, vendor mentions | Parsed from the New Generation Reps CRM "Activity Report/Call Log" layout |
| **Lead report (PDF)** | Pipeline tab | Uses the same CRM layout; tune once a real lead PDF is available |

PDFs contain no dollar amounts, so **sales figures come from the CSV**; the PDFs drive
the activity and pipeline views.

---

## Deploy (recommended: connect a Git repo — enables one-click future updates)

1. Put this whole folder in a GitHub repo (push it as-is).
2. In Netlify: **Add new site → Import an existing project → pick the repo.**
3. Build settings (Netlify reads `netlify.toml` automatically):
   - Build command: *(leave blank)*
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. **Passwords are baked in** — no env var required:
   - `NGRBailey` — shared password for all sales reps
   - `NGRCassandra` — admin (Cassandra)
   *(To change them, edit `DEFAULT_PASSWORDS` in `netlify/lib/store.mjs`, or set a `DASHBOARD_PASSWORDS` env var in Netlify — comma-separated — to override the whole list.)*
5. Deploy. Netlify installs the function dependencies from `package.json` automatically.
6. Open the site, enter the password, and upload a CSV / PDF — the dashboard updates and
   the data persists for the whole team.

### Blobs storage
Netlify Blobs is enabled automatically for sites with functions — **no account or key setup**.
Uploaded data lives in a store named `vk-dashboard`.

---

## Alternative: drag-and-drop (no backend)

If you just want the visual dashboard with sample data (no real uploads, no persistence),
drag the **`public/`** folder onto https://app.netlify.com/drop. It runs in Demo mode.
(Keep `index.html` and `assets/` together.)

---

## Endpoints (for reference)

- `POST /api/login`   `{ password }` → `{ token }`
- `GET  /api/data?from=&to=` → aggregated dashboard data
- `POST /api/upload`  `{ kind:'csv'|'activity'|'lead', filename, contentBase64 }`
- `POST /api/reset`   clears all stored data

All except `login` require the `x-auth-token` header when a password is set.

---

## Tuning PDF parsing

PDF text extraction depends on the exact report layout. If numbers look off after a real
upload, the logic to adjust is in **`netlify/lib/parse.mjs`**:
- `KNOWN_VENDORS` — add any vendor/factory names that appear in your reports
- `CATEGORIES`, `SEGMENTS` — activity types and client segments
- `extractActivities()` — how each activity row is split out

Send me a real activity **and** lead PDF and I'll tighten these to match exactly.
