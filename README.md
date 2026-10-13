# St Vincent's Gastro Department Management App

Portal for St Vincent's Hospital Melbourne Gastroenterology Department (40–60 staff).

## Features
- **Weekly Schedule & Full Roster**: Acute H&M oncall, ward rounds, consults, GICC, and journal clubs.
- **Shift Swaps**: Staff-initiated peer requests with coordinator PIN verification.
- **Leave Applications**: Direct database logging + auto-generated official St Vincent's PDF download ready for payroll submission.
- **In-Browser Roster Ingestion**: Drag & drop `.xlsx` spreadsheets to parse and update database without backend scripts.
- **Dual Storage Mode**: Works out of the box with offline browser storage / initial seed data, or connects directly to Supabase.

## Supabase Setup (Optional for cloud sync)
1. Create a free Supabase project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and execute [`supabase_schema.sql`](file:///Users/cbasnayake/Documents/Microsaas/Gastro%20Dept%20management%20site/supabase_schema.sql).
3. Copy your project URL and anon public key.
4. Set environment variables in Vercel or `.env.local`:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

## Deploying to Vercel
1. Push this repository to GitHub.
2. In Vercel, click **New Project** and select the repository.
3. Set **Root Directory** to `frontend`.
4. Deploy!
