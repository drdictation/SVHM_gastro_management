import sqlite3
import datetime
import os
import openpyxl

DB_PATH = os.path.join(os.path.dirname(__file__), "gastro_roster.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Staff table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        role TEXT DEFAULT 'consultant', -- consultant, registrar, coordinator, fellow
        is_coordinator INTEGER DEFAULT 0
    )
    ''')

    # Roster entries: H&M Oncall, Wards, Consults, GICC, Friday JC, IBD Meeting
    cur.execute('''
    CREATE TABLE IF NOT EXISTS roster_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_type TEXT NOT NULL, -- 'hm_oncall', 'ibd_wards', 'liver_wards', 'consults', 'gicc', 'friday_jc', 'ibd_meeting'
        date TEXT NOT NULL,       -- YYYY-MM-DD
        day_of_week TEXT,
        title TEXT,               -- e.g. "GICC Grand Round", "H&M Oncall", "Liver Ward Service"
        staff_name TEXT NOT NULL,
        role_label TEXT,          -- 'Consultant', 'Registrar', 'Chair', 'Speaker 1', 'Speaker 2', 'Presenter'
        notes TEXT,               -- e.g. 'Zoom', 'F2F', 'Mon-Wed / Thurs-Sun split'
        holiday TEXT,
        original_staff_name TEXT  -- track original assignment before swaps
    )
    ''')

    # Swap requests table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS swap_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_staff_name TEXT NOT NULL,
        requester_entry_id INTEGER NOT NULL,
        peer_staff_name TEXT NOT NULL,
        peer_entry_id INTEGER, -- optional peer entry if it is a two-way swap, or null if handover
        status TEXT DEFAULT 'pending_peer', -- 'pending_peer', 'pending_coordinator', 'approved', 'rejected'
        reason TEXT,
        created_at TEXT NOT NULL,
        peer_responded_at TEXT,
        coordinator_responded_at TEXT,
        token TEXT UNIQUE,     -- magic action token
        FOREIGN KEY (requester_entry_id) REFERENCES roster_entries(id)
    )
    ''')

    # Leave applications table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS leave_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_name TEXT NOT NULL,
        applicant_email TEXT,
        employee_number TEXT,
        department TEXT DEFAULT 'Gastroenterology',
        pay_in_advance TEXT DEFAULT 'No',
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        leave_hours TEXT,
        leave_balance TEXT,
        costing TEXT,
        allowances TEXT,
        submission_date TEXT,
        status TEXT DEFAULT 'submitted', -- 'submitted', 'approved', 'rejected'
        manager_name TEXT,
        created_at TEXT NOT NULL
    )
    ''')

    # Clinic Roster table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS clinic_roster (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_name TEXT NOT NULL,
        date TEXT NOT NULL,
        day_of_week TEXT,
        staff_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'attending', -- 'attending', 'off_routine', 'on_leave', 'holiday', 'closed'
        leave_type TEXT,
        coverage_status TEXT DEFAULT 'not_required', -- 'not_required', 'uncovered', 'covered'
        covering_staff_name TEXT,
        notes TEXT
    )
    ''')

    # Theatre Grid (Endoscopy Lists) table
    cur.execute('''
    CREATE TABLE IF NOT EXISTS theatre_grid_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        day_of_week TEXT,
        session TEXT NOT NULL, -- 'AM', 'PM'
        room_name TEXT NOT NULL,
        list_type TEXT,
        staff_name TEXT NOT NULL,
        coverage_status TEXT DEFAULT 'not_required', -- 'not_required', 'uncovered', 'covered'
        covering_staff_name TEXT,
        notes TEXT
    )
    ''')

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized at", DB_PATH)
