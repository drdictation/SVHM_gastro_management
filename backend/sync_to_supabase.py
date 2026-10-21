#!/usr/bin/env python3
"""
Sync / Seed all SQLite database tables to Supabase.

Usage:
    python3 backend/sync_to_supabase.py <SUPABASE_URL> <SUPABASE_KEY>

Example:
    python3 backend/sync_to_supabase.py https://xyzcompany.supabase.co eyJhbGci...
"""

import sys
import os
import sqlite3
import json
import ssl
import urllib.request
import urllib.error

DB_PATH = os.path.join(os.path.dirname(__file__), "gastro_roster.db")
SSL_CTX = ssl._create_unverified_context()

def chunker(seq, size):
    return (seq[pos:pos + size] for pos in range(0, len(seq), size))

def postgrest_insert(url, key, table, rows):
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    total = len(rows)
    inserted = 0
    batch_size = 500
    
    for batch in chunker(rows, batch_size):
        data = json.dumps(batch).encode('utf-8')
        req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, context=SSL_CTX) as resp:
                inserted += len(batch)
                print(f"  [{table}] Uploaded {inserted}/{total} rows...", end='\r')
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            print(f"\n[ERROR] Table {table} upload failed: {e.code} {err_msg}")
            return False
    print(f"\n  [OK] Table {table}: All {total} rows synced successfully.")
    return True

def main():
    if len(sys.argv) < 3:
        # Check env vars
        url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
        if not url or not key:
            print("Usage: python3 backend/sync_to_supabase.py <SUPABASE_URL> <SUPABASE_KEY>")
            sys.exit(1)
    else:
        url = sys.argv[1]
        key = sys.argv[2]

    if not os.path.exists(DB_PATH):
        print(f"Error: Database {DB_PATH} not found.")
        sys.exit(1)

    print(f"Connecting to SQLite: {DB_PATH}")
    print(f"Target Supabase: {url}\n")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    tables = ["staff", "roster_entries", "theatre_grid_entries", "clinic_roster", "leave_applications"]

    for table in tables:
        try:
            cur.execute(f"SELECT * FROM {table}")
            rows = [dict(r) for r in cur.fetchall()]
            if not rows:
                print(f"Table {table}: 0 rows (skipping)")
                continue
            print(f"Syncing {table} ({len(rows)} records)...")
            postgrest_insert(url, key, table, rows)
        except Exception as e:
            print(f"Skipping {table}: {e}")

    conn.close()
    print("\nSync complete! Your Supabase database is now fully populated.")

if __name__ == "__main__":
    main()
