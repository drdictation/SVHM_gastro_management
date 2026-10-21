# System Architecture & AI Agent Guide

Comprehensive architectural reference for AI coding agents working on the St Vincent's Hospital Melbourne Gastroenterology Department Management Platform.

---

## 1. Domain & Core Purpose

- **Facility**: St Vincent's Hospital Melbourne (SVHM), Department of Gastroenterology.
- **Users**: ~40–60 clinical staff (Consultants, Fellows, Registrars, Department Coordinators/Secretaries).
- **Domain Needs**:
  - Medical roster management across inpatient wards, on-call shifts, endoscopy lists, outpatient clinics, and academic meetings.
  - Cross-referencing leave against all clinical obligations to eliminate uncovered lists and ward gaps.
  - Controlled shift handover and two-way swap workflow with coordinator authorization.
  - Automated generation of hospital-compliant artifacts: official PDF leave applications and weekly Word bulletins.

---

## 2. System Architecture & Dual Storage Modes

```
               ┌────────────────────────────────────────────────────────┐
               │              Frontend (React 19 + Vite 8)              │
               │   Tabs: Weekly | Theatre | Clinics | Leave | Bulletin  │
               └───────────────┬────────────────────────┬───────────────┘
                               │                        │
                   Direct API  │                        │ Supabase JS SDK
                   Calls (/api)│                        │ (if env configured)
                               ▼                        ▼
     ┌───────────────────────────────────┐    ┌───────────────────────────┐
     │ FastAPI Backend (:8080)           │    │ Supabase (PostgreSQL)     │
     │ - SQLite: backend/gastro_roster.db│    │ Schema: supabase_schema   │
     │ - ICS feed exporter               │    └───────────────────────────┘
     │ - Coordinator conflict engine     │
     └───────────────────────────────────┘
                               │ (fallback when backend/cloud absent)
                               ▼
               ┌────────────────────────────────────────────────────────┐
               │    Browser LocalStorage + In-Memory Seed Fallback      │
               │    - seed_data.json, clinic_roster_seed.json           │
               │    - theatre_grid_weeks.json                           │
               └────────────────────────────────────────────────────────┘
```

### Storage Precedence (Defined in `frontend/src/api.js`)
1. **Supabase Mode**: When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present in `.env.local` / Vercel.
2. **FastAPI Backend Mode**: Local development via `Start App.command`. Vite proxies `/api` to `http://localhost:8080`.
3. **Standalone Browser Mode**: Pure client-side operation with `localStorage` initialized from bundled JSON files. All functions degrade gracefully.

---

## 3. Directory Layout

```
.
├── Start App.command              # 1-click launcher: starts FastAPI (:8080), Vite (:3000), opens browser
├── supabase_schema.sql            # Supabase PostgreSQL schema for cloud deployments
├── README.md                      # General repository documentation & setup
├── ARCHITECTURE.md                # This document (AI agent orientation)
│
├── backend/                       # Python FastAPI Backend
│   ├── database.py                # SQLite schema definition and DB initializer
│   ├── gastro_roster.db           # SQLite database file
│   ├── importer.py                # Multi-spreadsheet ingestion engine (openpyxl, csv)
│   └── main.py                    # REST API endpoints, ICS generator, conflict resolver
│
├── frontend/                      # React Frontend (Vite)
│   ├── package.json               # Dependencies: react 19, tailwindcss 4, pdf-lib, docx, xlsx
│   ├── vite.config.js             # Vite proxy (/api -> :8080) & Tailwind plugin
│   ├── src/
│   │   ├── main.jsx               # React entry point
│   │   ├── App.jsx                # Main application container, navigation, PIN gate
│   │   ├── App.css / index.css    # Styling
│   │   ├── api.js                 # Unified API abstraction (Supabase <-> Backend <-> LocalStorage)
│   │   ├── ClinicManager.jsx      # Outpatient clinics & leave coverage coordinator tab
│   │   ├── TheatreGridManager.jsx # 4-week rotating endoscopy & theatre grid tab
│   │   ├── LeaveCalendar.jsx      # Leave calendar, submission modal, clash inspection
│   │   ├── BulletinManager.jsx    # Weekly bulletin preview & docx generator
│   │   ├── bulletinDocx.js        # SVHM-style Word .docx builder using `docx`
│   │   ├── pdfGenerator.js        # SVHM Leave Application PDF stamper using `pdf-lib`
│   │   ├── theatreGrid.js         # 4-week cycle calculation & room-session logic
│   │   ├── rosterParser.js        # In-browser client-side XLSX/CSV parser
│   │   ├── seed_data.json         # Base seeds (staff, roster, leave)
│   │   ├── clinic_roster_seed.json# Outpatient clinic schedule data
│   │   └── theatre_grid_weeks.json# Default 4-week endoscopy template grid
│   └── public/
│       └── Leave Application.pdf  # St Vincent's blank leave PDF template for form-filling
│
└── raw data files/                # Master Excel / CSV source rosters
    ├── SMS roster schedule Gastroenterology 2026 V2 270126.xlsx
    ├── StVs_Clinic_Leave_Roster_2026-2028.xlsx
    ├── GICC 2026 V2.xlsx
    ├── Friday journal club V1.xlsx
    ├── 8.30 IBD meeting roster until Christmas.docx
    └── Theatre Grid 2026(*).csv
```

---

## 4. Database Schema (SQLite & Supabase)

### 1. `staff`
- `id`: Primary key.
- `name`: Full physician name (e.g., `Dr Cameron Bell`, `A/Prof Chris Hair`).
- `email`: Staff email.
- `role`: `consultant`, `registrar`, `fellow`, `coordinator`.
- `is_coordinator`: Integer flag (1 for department coordinator with approval rights).

### 2. `roster_entries`
- Inpatient wards, on-call, and departmental academic meetings.
- `entry_type`:
  - `hm_oncall`: Acute Heavy & Moderate on-call duty.
  - `ibd_wards`: Inpatient IBD ward service.
  - `liver_wards`: Inpatient Hepatology ward service.
  - `consults`: Inpatient consult service.
  - `gicc`: Gastrointestinal Clinical Conference (Grand Round).
  - `friday_jc`: Friday Morning Journal Club.
  - `ibd_meeting`: IBD Multidisciplinary Meeting.
- `date`: `YYYY-MM-DD`.
- `staff_name`: Assigned physician.
- `role_label`: `Consultant`, `Registrar`, `Chair`, `Speaker 1`, `Presenter`.
- `original_staff_name`: Original doctor before any shift swap.

### 3. `theatre_grid_entries`
- Endoscopy list assignments.
- `date`: `YYYY-MM-DD`.
- `day_of_week`: `Monday` - `Friday`.
- `session`: `AM` or `PM`.
- `room_name`: `Room 1`, `Room 2`, `Room 3`, `StV Private`, `Day Procedure Centre`.
- `list_type`: `Colonoscopy`, `Gastroscopy`, `EUS / ERCP`, `Capsule`, `General`.
- `staff_name`: Assigned endoscopist.
- `coverage_status`: `not_required`, `uncovered`, `covered`.
- `covering_staff_name`: Doctor taking list if primary on leave.

### 4. `clinic_roster`
- Outpatient specialty clinics.
- `clinic_name`: `Liver Clinic`, `IBD Clinic`, `General Gastro`, `Motility`, `Refractory Coeliac`.
- `date`: `YYYY-MM-DD`.
- `staff_name`: Assigned clinician.
- `status`: `attending`, `off_routine`, `on_leave`, `holiday`, `closed`.
- `coverage_status`: `not_required`, `uncovered`, `covered`.
- `covering_staff_name`: Doctor providing clinic coverage.

### 5. `leave_applications`
- `staff_name`: Doctor on leave.
- `employee_number`, `department`, `pay_in_advance`.
- `leave_type`: `Annual Leave`, `Conference Leave`, `SICK`, `Study Leave`, `Long Service Leave`.
- `start_date`, `end_date`: `YYYY-MM-DD`.
- `leave_hours`, `costing`, `allowances`.
- `status`: `submitted`, `approved`, `rejected`.

### 6. `swap_requests`
- `requester_staff_name`, `requester_entry_id`.
- `peer_staff_name`, `peer_entry_id` (null if one-way handover).
- `status`: `pending_peer` ➔ `pending_coordinator` ➔ `approved` / `rejected`.
- `reason`, `token`, `created_at`, `peer_responded_at`, `coordinator_responded_at`.

---

## 5. Key Workflows & Subsystems

### A. 4-Week Endoscopy Rotating Cycle (`theatreGrid.js`)
- Theatre schedules follow a 4-week repeating cycle (Week 1, Week 2, Week 3, Week 4).
- Cycle index calculated from a reference Monday anchor date:
  ```js
  const diffWeeks = Math.floor((mondayDate - REFERENCE_DATE) / (7 * 86400000));
  const cycleWeekNumber = ((diffWeeks % 4) + 4) % 4 + 1; // 1 to 4
  ```
- Override system allows per-date session overrides without mutating the 4-week recurring template.

### B. Shift Swap State Machine
1. Doctor initiates swap via `App.jsx` (`Full Roster` or `Weekly` view).
2. Saved with status `pending_peer`.
3. Peer reviews in `Shift Swaps` tab:
   - Accept: Transitions to `pending_coordinator`.
   - Reject: Marked `rejected`.
4. Coordinator reviews and submits authorization PIN (`1461`):
   - Approved: Both roster entries in `roster_entries` atomically swapped. `original_staff_name` preserved for audit.

### C. Leave & Clash Coordination Engine (`/api/leave-coverage-coordinator`)
Cross-references all active leave periods against:
1. `clinic_roster` for that doctor (flags unattended clinics).
2. `theatre_grid_entries` (flags uncovered endoscopy sessions).
3. `roster_entries` (flags on-call, wards, GICC chairs/presenters, journal club).
Provides a single unified dashboard in `Clinics & Leave Coordinator` tab for secretaries to assign covers.

### D. Automated Hospital Document Generation
- **Official Leave Application PDF** (`frontend/src/pdfGenerator.js`):
  - Uses `pdf-lib` to load `public/Leave Application.pdf`.
  - Coordinates text placement to stamp physician details, dates, employee numbers, and checkbox marks matching St Vincent's exact payroll format.
- **Weekly Department Bulletin DOCX** (`frontend/src/bulletinDocx.js`):
  - Uses `docx` to generate a formatted Word file including St Vincent's header styling, weekly on-call rotas, academic meeting agendas, and general announcements.

---

## 6. Timezone & Data Conventions

- **Timezone**: All dates operate in Australian Eastern Time (`Australia/Melbourne`).
- **Date Formatting**: Internally stored as ISO `YYYY-MM-DD`. Displayed to users as `DD/MM/YYYY`.
- **Coordinator PIN**: Default development coordinator override PIN is `1461`.
- **Port Allocation**:
  - Backend (FastAPI): `8080`
  - Frontend (Vite): `3000`
