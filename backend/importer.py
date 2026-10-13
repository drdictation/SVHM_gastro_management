import openpyxl
import docx
import os
import sqlite3
import datetime
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gastro_roster.db")

def parse_date(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, str):
        val = val.strip()
        try:
            # Try YYYY-MM-DD
            dt = datetime.datetime.strptime(val[:10], "%Y-%m-%d")
            return dt.strftime("%Y-%m-%d")
        except:
            pass
    return None

def clean_name(name):
    if not name:
        return ""
    name = str(name).strip()
    # Remove prefix titles if any or keep consistent
    return name

def import_all():
    from database import init_db
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Clear existing entries
    cur.execute("DELETE FROM roster_entries")
    cur.execute("DELETE FROM staff")

    staff_set = set()

    # 1. Staff roster from SMS Sheet2
    sms_file = os.path.join(BASE_DIR, "SMS roster schedule Gastroenterology 2026 V2 270126.xlsx")
    if os.path.exists(sms_file):
        wb = openpyxl.load_workbook(sms_file, data_only=True)
        if "Sheet2" in wb.sheetnames:
            ws2 = wb["Sheet2"]
            for r in range(1, ws2.max_row + 1):
                raw = ws2.cell(r, 2).value
                if raw and str(raw).strip():
                    cleaned = clean_name(raw)
                    staff_set.add(cleaned)
                    is_coord = 1 if "Basnayake" in cleaned or "Thompson" in cleaned else 0
                    cur.execute(
                        "INSERT OR IGNORE INTO staff (name, email, role, is_coordinator) VALUES (?, ?, ?, ?)",
                        (cleaned, f"{cleaned.lower().replace(' ', '.').replace('dr.', '').replace('prof.', '').replace('assoc', '').replace('..', '.')[:15]}@svha.org.au", 'consultant', is_coord)
                    )

        # 2. Import SMS On-call, wards, consults from Sheet1
        ws1 = wb["Sheet1"]
        # Data rows start at 10
        for r in range(10, ws1.max_row + 1):
            date_val = parse_date(ws1.cell(r, 3).value)
            if not date_val:
                continue
            holiday = ws1.cell(r, 1).value
            holiday = str(holiday).strip() if holiday else None
            
            # HM Registrar (Col 12)
            reg = ws1.cell(r, 12).value
            if reg and str(reg).strip():
                s_name = clean_name(reg)
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('hm_oncall', date_val, 'Monday-Sunday', 'H&M Oncall Registrar', s_name, 'Registrar', None, holiday, s_name)
                )

            # HM Consultant (Col 14)
            cons = ws1.cell(r, 14).value
            if cons and str(cons).strip():
                s_name = clean_name(cons)
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('hm_oncall', date_val, 'Monday-Sunday', 'H&M Oncall Consultant', s_name, 'Consultant', None, holiday, s_name)
                )

            # IBD Wards (Col 17)
            ibd = ws1.cell(r, 17).value
            if ibd and str(ibd).strip():
                s_name = clean_name(ibd)
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('ibd_wards', date_val, 'Monday-Sunday', 'IBD Ward Service', s_name, 'Consultant', None, holiday, s_name)
                )

            # Liver Wards (Col 19)
            liver = ws1.cell(r, 19).value
            if liver and str(liver).strip():
                s_name = clean_name(liver)
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('liver_wards', date_val, 'Monday-Sunday', 'Liver Ward Service', s_name, 'Consultant', None, holiday, s_name)
                )

            # Consults (Col 21)
            consults = ws1.cell(r, 21).value
            if consults and str(consults).strip():
                s_name = clean_name(consults)
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('consults', date_val, 'Monday-Sunday', 'Consults Consultant', s_name, 'Consultant', None, holiday, s_name)
                )

    # 3. Import GICC 2026 V2.xlsx
    gicc_file = os.path.join(BASE_DIR, "GICC 2026 V2.xlsx")
    if os.path.exists(gicc_file):
        wb_g = openpyxl.load_workbook(gicc_file, data_only=True)
        if "GICC roster" in wb_g.sheetnames:
            ws_g = wb_g["GICC roster"]
            for r in range(10, ws_g.max_row + 1):
                date_val = parse_date(ws_g.cell(r, 3).value)
                if not date_val:
                    continue
                holiday = ws_g.cell(r, 1).value
                holiday = str(holiday).strip() if holiday else None
                meeting_format = ws_g.cell(r, 4).value # F2F or Zoom
                
                chair = ws_g.cell(r, 5).value
                if chair and str(chair).strip():
                    cur.execute(
                        "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        ('gicc', date_val, 'Monday 12:30pm', 'GICC Meeting Chair', clean_name(chair), 'Chair', str(meeting_format or ''), holiday, clean_name(chair))
                    )

                spk1 = ws_g.cell(r, 6).value
                if spk1 and str(spk1).strip():
                    cur.execute(
                        "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        ('gicc', date_val, 'Monday 12:30pm', 'GICC Meeting Speaker 1', clean_name(spk1), 'Speaker 1', str(meeting_format or ''), holiday, clean_name(spk1))
                    )

                spk2 = ws_g.cell(r, 7).value
                if spk2 and str(spk2).strip():
                    cur.execute(
                        "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        ('gicc', date_val, 'Monday 12:30pm', 'GICC Meeting Speaker 2', clean_name(spk2), 'Speaker 2', str(meeting_format or ''), holiday, clean_name(spk2))
                    )

    # 4. Import Friday journal club V1.xlsx
    jc_file = os.path.join(BASE_DIR, "Friday journal club V1.xlsx")
    if os.path.exists(jc_file):
        wb_jc = openpyxl.load_workbook(jc_file, data_only=True)
        ws_jc = wb_jc.active
        for r in range(7, ws_jc.max_row + 1):
            date_val = parse_date(ws_jc.cell(r, 3).value)
            if not date_val:
                continue
            holiday = ws_jc.cell(r, 1).value
            holiday = str(holiday).strip() if holiday else None
            presenter = ws_jc.cell(r, 4).value
            if presenter and str(presenter).strip():
                cur.execute(
                    "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ('friday_jc', date_val, 'Friday 8:00am', 'Friday Journal Club', clean_name(presenter), 'Presenter', None, holiday, clean_name(presenter))
                )

    # 5. Import 8.30 IBD meeting roster until Christmas.docx
    ibd_doc = os.path.join(BASE_DIR, "8.30 IBD meeting roster until Christmas.docx")
    if os.path.exists(ibd_doc):
        doc = docx.Document(ibd_doc)
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue
            # Format like '7/9: Review of HPOS paperwork' or '14/9: Journal Club. LY'
            match = re.match(r'^(\d{1,2})[/.](\d{1,2})[:.]?\s*(.*)', text)
            if match:
                day, month, details = match.groups()
                # Assuming 2026 for consistent calendar
                try:
                    d_obj = datetime.date(2026, int(month), int(day))
                    d_str = d_obj.strftime("%Y-%m-%d")
                    cur.execute(
                        "INSERT INTO roster_entries (entry_type, date, day_of_week, title, staff_name, role_label, notes, holiday, original_staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        ('ibd_meeting', d_str, 'Monday 8:30am', 'IBD Morning Meeting', details, 'Lead', details, None, details)
                    )
                except Exception as e:
                    pass

    conn.commit()
    cur.execute("SELECT count(*) FROM roster_entries")
    count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM staff")
    staff_count = cur.fetchone()[0]
    conn.close()
    print(f"Import complete: {count} roster entries, {staff_count} staff loaded.")

if __name__ == "__main__":
    import_all()
