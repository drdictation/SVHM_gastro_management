# Frontend (React 19 + Vite 8 + Tailwind CSS v4)

Client web application for St Vincent's Gastro Department Management.

## Architecture

- **Framework**: React 19 SPA powered by Vite 8 with Tailwind CSS v4.
- **Entry point**: `src/main.jsx` -> `src/App.jsx`.
- **API abstraction**: `src/api.js` (handles Supabase, FastAPI backend proxy via `/api`, and `localStorage` fallback).

## Core Modules & Components

- [App.jsx](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/App.jsx): Top navigation, PIN verification modal, tabs for Weekly Digest, Full Roster, Shift Swaps, and Ingestion.
- [ClinicManager.jsx](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/ClinicManager.jsx): Outpatient clinic schedule view and leave clash coverage coordinator.
- [TheatreGridManager.jsx](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/TheatreGridManager.jsx): 4-week rotating endoscopy & theatre list scheduler.
- [LeaveCalendar.jsx](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/LeaveCalendar.jsx): Leave application calendar and review table.
- [BulletinManager.jsx](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/BulletinManager.jsx): Weekly department bulletin generator and preview.
- [bulletinDocx.js](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/bulletinDocx.js): Word `.docx` builder using `docx`.
- [pdfGenerator.js](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/pdfGenerator.js): Official St Vincent's Leave Application PDF form-filler using `pdf-lib`.
- [theatreGrid.js](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/theatreGrid.js): 4-week cycle calculation and endoscopy conflict detection.
- [rosterParser.js](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/frontend/src/rosterParser.js): In-browser Excel/CSV file parser using `xlsx`.

## Development Commands

```bash
# Install dependencies
npm install

# Run dev server with hot reload (proxies /api to http://localhost:8080)
npm run dev -- --port 3000

# Build production bundle
npm run build

# Lint
npm run lint
```
