# St Vincent's Gastro Department Management Platform

Clinical operations and roster coordination platform for the Gastroenterology Department at **St Vincent's Hospital Melbourne** (servicing 40–60 clinical staff).

> [!NOTE]
> AI agents and contributors: read [ARCHITECTURE.md](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/ARCHITECTURE.md) for deep-dive technical architecture, data flows, and subsystem specifications.

---

## What This App Is For

Manages department medical scheduling and administrative compliance:
1. **Weekly Wards & On-Call**: Acute H&M oncall, IBD ward, Liver ward, Inpatient consults, GICC grand round, Friday journal club, and IBD multidisciplinary meeting rosters.
2. **Endoscopy & Theatre Grid**: 4-week rotating procedural grid covering rooms and sessions (AM/PM) with per-date session overrides.
3. **Outpatient Clinics & Coverage**: Clinic attendance tracking across specialty outpatient clinics with leave-clash detection and cover assignment.
4. **Leave Management & St Vincent's PDF Export**: Leave application recording and auto-population into the official hospital payroll PDF template.
5. **Shift Swaps & Handovers**: Doctor-to-doctor swap workflow with coordinator PIN approval (`1461`).
6. **Weekly Department Bulletin Generator**: Automated generation and export of Word `.docx` weekly bulletins matching hospital format.
7. **Roster Ingestion Engine**: Drag-and-drop ingestion of official department `.xlsx` and `.csv` roster files.
8. **Live Calendar Sync**: Live iCalendar (`.ics`) feed export for personal calendar apps.

---

## Tech Stack & Architecture

- **Frontend**: React 19, Tailwind CSS v4, Vite 8, Lucide Icons, `pdf-lib` (PDF form filling), `docx` (Word generation), `xlsx` (in-browser spreadsheet parsing).
- **Backend**: Python 3.12, FastAPI, SQLite (`backend/gastro_roster.db`), `openpyxl`.
- **Cloud/Persistence Options**:
  - **Local Development**: FastAPI on `:8080`, Vite on `:3000` (proxies `/api` to backend).
  - **Serverless / Cloud**: Optional Supabase PostgreSQL backend via [supabase_schema.sql](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/supabase_schema.sql).
  - **Standalone Browser Mode**: Built-in fallback to `localStorage` + JSON seeds if backend or cloud are absent.

---

## Quickstart

### 1-Click Launch (macOS)
Double-click or run:
```bash
./"Start App.command"
```
Starts FastAPI on port 8080, Vite on port 3000, and opens `http://localhost:3000`.

### Manual Startup

#### Backend
```bash
# From workspace root
./venv/bin/python -m uvicorn backend.main:app --port 8080
```

#### Frontend
```bash
cd frontend
npm install
npm run dev -- --port 3000
```
Open [http://localhost:3000](http://localhost:3000).

---

## Key Credentials & Defaults

- **Coordinator PIN**: `1461` (used for approving swaps and managing administrative overrides).
- **Default Timezone**: `Australia/Melbourne`.
- **Backend API**: `http://localhost:8080`
- **Frontend App**: `http://localhost:3000`

---

## Supabase Setup (Optional Cloud Sync)

1. Create a project at [supabase.com](https://supabase.com).
2. Run [supabase_schema.sql](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/supabase_schema.sql) in Supabase **SQL Editor**.
3. Create `frontend/.env.local`:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Deploy to Vercel with Root Directory set to `frontend`.
