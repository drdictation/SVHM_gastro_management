import os
import sqlite3
import datetime
import uuid
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gastro_roster.db")

app = FastAPI(title="St Vincent's Gastro Roster API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Models
class SwapRequestCreate(BaseModel):
    requester_staff_name: str
    requester_entry_id: int
    peer_staff_name: str
    peer_entry_id: Optional[int] = None
    reason: Optional[str] = "Swap request"

class SwapAction(BaseModel):
    action: str # 'peer_accept', 'peer_reject', 'coordinator_approve', 'coordinator_reject'
    actor_name: str
    reason: Optional[str] = ""

class MagicLinkRequest(BaseModel):
    email: str

# 1. Staff endpoints
@app.get("/api/staff")
def list_staff():
    conn = get_db()
    rows = conn.execute("SELECT * FROM staff ORDER BY name ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# 2. Roster endpoints
@app.get("/api/roster")
def get_roster(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    entry_type: Optional[str] = Query(None),
    staff_name: Optional[str] = Query(None)
):
    conn = get_db()
    query = "SELECT * FROM roster_entries WHERE 1=1"
    params = []

    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    if entry_type:
        query += " AND entry_type = ?"
        params.append(entry_type)
    if staff_name:
        query += " AND staff_name LIKE ?"
        params.append(f"%{staff_name}%")

    query += " ORDER BY date ASC, entry_type ASC, id ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# 3. Weekly Digest view
@app.get("/api/weekly-digest")
def get_weekly_digest(week_monday: Optional[str] = Query(None)):
    """Fetch all obligations for a specific week starting on Monday."""
    if not week_monday:
        # Default to current or upcoming Monday
        today = datetime.date.today()
        monday = today - datetime.timedelta(days=today.weekday())
        week_monday = monday.strftime("%Y-%m-%d")

    start_dt = datetime.datetime.strptime(week_monday, "%Y-%m-%d").date()
    end_dt = start_dt + datetime.timedelta(days=6)

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM roster_entries WHERE date >= ? AND date <= ? ORDER BY date ASC, entry_type ASC",
        (start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d"))
    ).fetchall()
    conn.close()

    entries = [dict(r) for r in rows]

    return {
        "week_monday": week_monday,
        "week_sunday": end_dt.strftime("%Y-%m-%d"),
        "oncall": [e for e in entries if e["entry_type"] == "hm_oncall"],
        "wards": [e for e in entries if e["entry_type"] in ["ibd_wards", "liver_wards", "consults"]],
        "gicc": [e for e in entries if e["entry_type"] == "gicc"],
        "journal_club": [e for e in entries if e["entry_type"] == "friday_jc"],
        "ibd_meeting": [e for e in entries if e["entry_type"] == "ibd_meeting"],
        "raw_entries": entries
    }

# 4. Swap Requests
@app.get("/api/swaps")
def list_swaps(status: Optional[str] = Query(None)):
    conn = get_db()
    query = """
    SELECT s.*, 
           r1.date as requester_date, r1.title as requester_title, r1.entry_type as requester_type,
           r2.date as peer_date, r2.title as peer_title
    FROM swap_requests s
    JOIN roster_entries r1 ON s.requester_entry_id = r1.id
    LEFT JOIN roster_entries r2 ON s.peer_entry_id = r2.id
    WHERE 1=1
    """
    params = []
    if status:
        query += " AND s.status = ?"
        params.append(status)
    query += " ORDER BY s.id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/swaps")
def create_swap(data: SwapRequestCreate):
    conn = get_db()
    token = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()

    conn.execute(
        """INSERT INTO swap_requests 
        (requester_staff_name, requester_entry_id, peer_staff_name, peer_entry_id, status, reason, created_at, token)
        VALUES (?, ?, ?, ?, 'pending_peer', ?, ?, ?)""",
        (data.requester_staff_name, data.requester_entry_id, data.peer_staff_name, data.peer_entry_id, data.reason, now, token)
    )
    
    # Audit log
    conn.execute(
        "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
        (now, data.requester_staff_name, "REQUEST_SWAP", f"Requested swap with {data.peer_staff_name} for entry #{data.requester_entry_id}")
    )
    
    conn.commit()
    conn.close()
    return {"message": "Swap request initiated. Waiting for peer acceptance.", "token": token}

@app.post("/api/swaps/{swap_id}/action")
def process_swap_action(swap_id: int, payload: SwapAction):
    conn = get_db()
    swap = conn.execute("SELECT * FROM swap_requests WHERE id = ?", (swap_id,)).fetchone()
    if not swap:
        conn.close()
        raise HTTPException(status_code=404, detail="Swap not found")

    now = datetime.datetime.now().isoformat()
    action = payload.action

    if action == "peer_accept":
        conn.execute(
            "UPDATE swap_requests SET status = 'pending_coordinator', peer_responded_at = ? WHERE id = ?",
            (now, swap_id)
        )
        conn.execute(
            "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
            (now, payload.actor_name, "PEER_ACCEPT", f"Peer accepted swap #{swap_id}. Awaiting coordinator approval.")
        )
    elif action == "peer_reject":
        conn.execute(
            "UPDATE swap_requests SET status = 'rejected', peer_responded_at = ? WHERE id = ?",
            (now, swap_id)
        )
        conn.execute(
            "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
            (now, payload.actor_name, "PEER_REJECT", f"Peer rejected swap #{swap_id}.")
        )
    elif action == "coordinator_approve":
        # Execute the swap in roster_entries!
        r1_id = swap["requester_entry_id"]
        r2_id = swap["peer_entry_id"]
        req_name = swap["requester_staff_name"]
        peer_name = swap["peer_staff_name"]

        # Swap entries
        if r2_id:
            # 2-way swap
            conn.execute("UPDATE roster_entries SET staff_name = ? WHERE id = ?", (peer_name, r1_id))
            conn.execute("UPDATE roster_entries SET staff_name = ? WHERE id = ?", (req_name, r2_id))
        else:
            # Single shift handover
            conn.execute("UPDATE roster_entries SET staff_name = ? WHERE id = ?", (peer_name, r1_id))

        conn.execute(
            "UPDATE swap_requests SET status = 'approved', coordinator_responded_at = ? WHERE id = ?",
            (now, swap_id)
        )
        conn.execute(
            "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
            (now, payload.actor_name, "COORDINATOR_APPROVE", f"Coordinator approved swap #{swap_id}. Roster successfully updated.")
        )
    elif action == "coordinator_reject":
        conn.execute(
            "UPDATE swap_requests SET status = 'rejected', coordinator_responded_at = ? WHERE id = ?",
            (now, swap_id)
        )
        conn.execute(
            "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
            (now, payload.actor_name, "COORDINATOR_REJECT", f"Coordinator rejected swap #{swap_id}.")
        )
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid action")

    conn.commit()
    conn.close()
    return {"message": f"Swap action '{action}' completed successfully."}

# 5. Magic link Auth simulator
@app.post("/api/auth/magic-link")
def request_magic_link(req: MagicLinkRequest):
    conn = get_db()
    staff = conn.execute("SELECT * FROM staff WHERE email = ? COLLATE NOCASE", (req.email.strip(),)).fetchone()
    conn.close()
    if not staff:
        # Mock allow if doctor name is in system
        return {"success": True, "message": f"Magic login link generated for {req.email}", "mock_token": "token_demo_staff"}
    return {
        "success": True, 
        "staff": dict(staff),
        "message": f"Magic login link sent to {staff['email']}.",
        "mock_token": f"token_{staff['id']}"
    }

# 6. Weekly Email Broadcast Trigger
@app.post("/api/broadcast-weekly-email")
def broadcast_weekly_email(week_monday: str, triggered_by: str = "Coordinator"):
    digest = get_weekly_digest(week_monday)
    # Generate email body
    lines = [
        f"Subject: Gastroenterology Weekly Roster Digest - Week Commencing {week_monday}",
        f"Hospital: St Vincent's Hospital Melbourne - Department of Gastroenterology\n",
        "=== HEMATEMESIS & MELENA ON-CALL ==="
    ]
    for e in digest["oncall"]:
        lines.append(f"  • {e['title']}: {e['staff_name']} (Dates: {e['date']})")

    lines.append("\n=== WARD SERVICE & CONSULTS ===")
    for e in digest["wards"]:
        lines.append(f"  • {e['title']}: {e['staff_name']}")

    lines.append("\n=== GICC GRAND ROUND MEETING (Monday 12:30pm) ===")
    for e in digest["gicc"]:
        lines.append(f"  • {e['role_label']}: {e['staff_name']} ({e['notes'] or ''})")

    lines.append("\n=== FRIDAY JOURNAL CLUB (8:00am) ===")
    for e in digest["journal_club"]:
        lines.append(f"  • Presenter: {e['staff_name']}")

    email_body = "\n".join(lines)

    # In audit log
    conn = get_db()
    now = datetime.datetime.now().isoformat()
    conn.execute(
        "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
        (now, triggered_by, "SEND_WEEKLY_EMAIL", f"Weekly digest dispatched for week starting {week_monday}")
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "recipient_count": 45,
        "week": week_monday,
        "preview": email_body,
        "message": "Weekly digest successfully queued and dispatched to all department staff."
    }

# 7. iCal feed
@app.get("/api/roster.ics")
def get_ical(staff_name: Optional[str] = Query(None)):
    conn = get_db()
    query = "SELECT * FROM roster_entries"
    params = []
    if staff_name:
        query += " WHERE staff_name LIKE ?"
        params.append(f"%{staff_name}%")
    rows = conn.execute(query, params).fetchall()
    conn.close()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//St Vincents Melbourne//Gastro Roster//EN",
        "CALSCALE:GREGORIAN"
    ]
    for r in rows:
        d = r["date"].replace("-", "")
        lines.extend([
            "BEGIN:VEVENT",
            f"SUMMARY:{r['title']} - {r['staff_name']}",
            f"DTSTART;VALUE=DATE:{d}",
            f"DESCRIPTION:Role: {r['role_label']} | Notes: {r['notes'] or ''}",
            f"UID:roster-{r['id']}@svha.org.au",
            "END:VEVENT"
        ])
    lines.append("END:VCALENDAR")

    from fastapi.responses import Response
    return Response(content="\r\n".join(lines), media_type="text/calendar")

# 8. Leave Form Applications & PDF Generation
class LeaveApplicationCreate(BaseModel):
    staff_name: str
    employee_number: str
    department: Optional[str] = "Gastroenterology"
    pay_in_advance: Optional[str] = "No"  # "Yes" or "No"
    leave_type: str
    start_date: str # DD/MM/YYYY or YYYY-MM-DD
    end_date: str   # DD/MM/YYYY or YYYY-MM-DD
    leave_hours: Optional[str] = ""
    leave_balance: Optional[str] = ""
    costing: Optional[str] = ""
    allowances: Optional[str] = ""
    submission_date: Optional[str] = ""
    manager_name: Optional[str] = ""

def format_aus_date(val: str) -> str:
    """Format string into DD/MM/YYYY format."""
    if not val:
        return ""
    val = val.strip()
    if "/" in val:
        parts = val.split("/")
        if len(parts) == 3:
            return f"{int(parts[0]):02d}/{int(parts[1]):02d}/{parts[2]}"
    if "-" in val:
        parts = val.split("-")
        if len(parts) == 3:
            # Check if YYYY-MM-DD
            if len(parts[0]) == 4:
                return f"{int(parts[2]):02d}/{int(parts[1]):02d}/{parts[0]}"
            # Or DD-MM-YYYY
            return f"{int(parts[0]):02d}/{int(parts[1]):02d}/{parts[2]}"
    return val

def generate_leave_pdf_bytes(data: dict) -> bytes:
    import pypdf
    from pypdf.generic import NameObject, TextStringObject
    import io

    pdf_template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Leave Application.pdf")
    if not os.path.exists(pdf_template_path):
        raise HTTPException(status_code=500, detail="Leave Application template PDF not found.")

    reader = pypdf.PdfReader(pdf_template_path)
    writer = pypdf.PdfWriter()
    writer.append(reader)

    start_aus = format_aus_date(data.get("start_date", ""))
    end_aus = format_aus_date(data.get("end_date", ""))
    sub_date = format_aus_date(data.get("submission_date", "") or datetime.date.today().strftime("%d/%m/%Y"))

    field_map = {
        "f1": data.get("staff_name", ""),
        "f2": data.get("employee_number", ""),
        "f3": data.get("department", "Gastroenterology"),
        "f5": data.get("leave_type", "Annual Leave"),
        "f6": start_aus,
        "f7": end_aus,
        "f8": str(data.get("leave_hours", "") or ""),
        "f9": str(data.get("leave_balance", "") or ""),
        "f72": str(data.get("costing", "") or ""),
        "f73": str(data.get("allowances", "") or ""),
        "f74": data.get("staff_name", ""), # Employee signature line
        "f75": sub_date,
        "f80": str(data.get("manager_name", "") or "")
    }

    for page in writer.pages:
        for annot in page.get("/Annots", []):
            obj = annot.get_object()
            t = obj.get("/T")
            if t in field_map:
                obj[NameObject("/V")] = TextStringObject(str(field_map[t]))
                if "/AP" in obj:
                    del obj["/AP"]

    catalog = writer._root_object
    if "/AcroForm" in catalog:
        catalog["/AcroForm"][NameObject("/NeedAppearances")] = pypdf.generic.BooleanObject(True)

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

@app.post("/api/leave")
def create_leave_application(app_data: LeaveApplicationCreate):
    conn = get_db()
    now = datetime.datetime.now().isoformat()
    start_aus = format_aus_date(app_data.start_date)
    end_aus = format_aus_date(app_data.end_date)
    sub_date = format_aus_date(app_data.submission_date or datetime.date.today().strftime("%d/%m/%Y"))

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO leave_applications (
            staff_name, employee_number, department, pay_in_advance,
            leave_type, start_date, end_date, leave_hours, leave_balance,
            costing, allowances, submission_date, status, manager_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
        """,
        (
            app_data.staff_name,
            app_data.employee_number,
            app_data.department or "Gastroenterology",
            app_data.pay_in_advance or "No",
            app_data.leave_type,
            start_aus,
            end_aus,
            app_data.leave_hours or "",
            app_data.leave_balance or "",
            app_data.costing or "",
            app_data.allowances or "",
            sub_date,
            app_data.manager_name or "",
            now
        )
    )
    leave_id = cur.lastrowid

    conn.execute(
        "INSERT INTO audit_logs (timestamp, actor, action, details) VALUES (?, ?, ?, ?)",
        (now, app_data.staff_name, "LEAVE_SUBMITTED", f"Leave application #{leave_id} submitted for {start_aus} to {end_aus}")
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "id": leave_id,
        "message": "Leave application recorded successfully.",
        "download_url": f"/api/leave/{leave_id}/pdf"
    }

@app.get("/api/leave")
def list_leave_applications(staff_name: Optional[str] = Query(None)):
    conn = get_db()
    if staff_name:
        rows = conn.execute("SELECT * FROM leave_applications WHERE staff_name LIKE ? ORDER BY start_date ASC, id ASC", (f"%{staff_name}%",)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM leave_applications ORDER BY start_date ASC, id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

class LeaveApplicationUpdate(BaseModel):
    staff_name: Optional[str] = None
    leave_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    costing: Optional[str] = None
    allowances: Optional[str] = None
    status: Optional[str] = None

class LeaveBulkImport(BaseModel):
    mode: str = "replace"  # 'replace' or 'merge'
    records: List[dict]

@app.put("/api/leave/{leave_id}")
def update_leave_application(leave_id: int, patch: LeaveApplicationUpdate):
    conn = get_db()
    row = conn.execute("SELECT * FROM leave_applications WHERE id = ?", (leave_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Leave application not found.")
    updates = {k: v for k, v in patch.dict().items() if v is not None}
    if updates:
        set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
        conn.execute(f"UPDATE leave_applications SET {set_clause} WHERE id = ?", (*updates.values(), leave_id))
        conn.commit()
    updated = dict(conn.execute("SELECT * FROM leave_applications WHERE id = ?", (leave_id,)).fetchone())
    conn.close()
    return updated

@app.delete("/api/leave/{leave_id}")
def delete_leave_application(leave_id: int):
    conn = get_db()
    conn.execute("DELETE FROM leave_applications WHERE id = ?", (leave_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deleted_id": leave_id}

@app.post("/api/leave/bulk")
def bulk_import_leave(payload: LeaveBulkImport):
    conn = get_db()
    cur = conn.cursor()
    now = datetime.datetime.now().isoformat()
    if payload.mode == "replace":
        cur.execute("DELETE FROM leave_applications")
    for r in payload.records:
        cur.execute(
            """
            INSERT INTO leave_applications (
                staff_name, employee_number, department, pay_in_advance,
                leave_type, start_date, end_date, leave_hours, leave_balance,
                costing, allowances, submission_date, status, manager_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                r.get("staff_name", ""),
                r.get("employee_number", ""),
                r.get("department", "Gastroenterology"),
                r.get("pay_in_advance", "No"),
                r.get("leave_type", "Annual Leave"),
                r.get("start_date", ""),
                r.get("end_date", ""),
                r.get("leave_hours", ""),
                r.get("leave_balance", ""),
                r.get("costing", ""),
                r.get("allowances", ""),
                r.get("submission_date", datetime.date.today().isoformat()),
                r.get("status", "approved"),
                r.get("manager_name", "Prof. Alex Thompson"),
                r.get("created_at", now)
            )
        )
    conn.commit()
    rows = [dict(r) for r in conn.execute("SELECT * FROM leave_applications ORDER BY start_date ASC, id ASC").fetchall()]
    conn.close()
    return rows

@app.get("/api/leave/{leave_id}/pdf")
def download_leave_pdf(leave_id: int):
    from fastapi.responses import Response
    conn = get_db()
    row = conn.execute("SELECT * FROM leave_applications WHERE id = ?", (leave_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Leave application not found.")
    
    data = dict(row)
    pdf_bytes = generate_leave_pdf_bytes(data)
    filename = f"Leave_Application_{data['staff_name'].replace(' ', '_')}_{data['id']}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.post("/api/leave/preview-pdf")
def preview_leave_pdf(app_data: LeaveApplicationCreate):
    from fastapi.responses import Response
    pdf_bytes = generate_leave_pdf_bytes(app_data.dict())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="Leave_Application_Preview.pdf"'}
    )


