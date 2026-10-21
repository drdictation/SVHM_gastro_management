import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import List, Dict, Any, Tuple

# Load simple .env if exists
def load_dotenv_fallback():
    for env_path in [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), ".env")
    ]:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k not in os.environ:
                            os.environ[k] = v

load_dotenv_fallback()

GMAIL_USER = os.getenv("GMAIL_USER", "gastroenterologystvincents@gmail.com")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))

COORDINATOR_EMAIL = os.getenv("COORDINATOR_EMAIL", "anne.savage@svha.org.au")
ENDOSCOPY_WAITINGLIST_EMAIL = os.getenv("ENDOSCOPY_WAITINGLIST_EMAIL", "Endoscopy Waitinglist - SVHM <Endoscopy.Waitinglist@svhm.org.au>")
CLINIC_COORDINATION_EMAIL = os.getenv("CLINIC_COORDINATION_EMAIL", "gastroenterology.caseco-ordinationteam <gastroenterology.cas@svha.org.au>")

def extract_raw_email(addr: str) -> str:
    """Extract raw email address from strings like 'Name <email@svha.org.au>' or raw 'email@svha.org.au'."""
    if not addr:
        return ""
    m = re.search(r'<([^>]+)>', addr)
    if m:
        return m.group(1).strip()
    return addr.strip()

def build_leave_email(
    leave_data: Dict[str, Any],
    pdf_bytes: bytes,
    endo_clashes: List[Dict[str, Any]],
    clinic_clashes: List[Dict[str, Any]]
) -> Tuple[MIMEMultipart, List[str]]:
    staff_name = leave_data.get("staff_name", "Clinical Staff")
    emp_no = leave_data.get("employee_number", "-")
    leave_type = leave_data.get("leave_type", "Annual Leave")
    start_date = leave_data.get("start_date", "")
    end_date = leave_data.get("end_date", "")
    hours = leave_data.get("leave_hours", "")
    manager = leave_data.get("manager_name", "Prof. Alex Thompson")
    applicant_email = leave_data.get("applicant_email", "").strip()

    # Determine recipients
    to_list: List[str] = []
    if applicant_email:
        to_list.append(applicant_email)
    to_list.append(COORDINATOR_EMAIL)

    cc_list: List[str] = []
    has_endo = bool(endo_clashes and len(endo_clashes) > 0)
    has_clinic = bool(clinic_clashes and len(clinic_clashes) > 0)

    if has_endo:
        cc_list.append(ENDOSCOPY_WAITINGLIST_EMAIL)
    if has_clinic:
        cc_list.append(CLINIC_COORDINATION_EMAIL)

    # Collect raw envelope recipients (deduplicated)
    all_envelope: List[str] = []
    for r in to_list + cc_list:
        raw = extract_raw_email(r)
        if raw and raw.lower() not in [e.lower() for e in all_envelope]:
            all_envelope.append(raw)

    msg = MIMEMultipart("mixed")
    msg["From"] = f"Gastroenterology St Vincent's <{GMAIL_USER}>"
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = f"Leave Application: {staff_name} ({start_date} to {end_date})"

    # Plain text summary
    text_lines = [
        f"ST VINCENT'S HOSPITAL MELBOURNE - DEPARTMENT OF GASTROENTEROLOGY",
        f"LEAVE APPLICATION NOTIFICATION",
        f"-------------------------------------------------------------",
        f"Staff Member:     {staff_name}",
        f"Employee Number:  {emp_no}",
        f"Leave Type:       {leave_type}",
        f"Start Date:       {start_date}",
        f"End Date:         {end_date}",
        f"Hours/Days:       {hours}",
        f"Manager:          {manager}",
        f"Coordinator:      {COORDINATOR_EMAIL}",
        ""
    ]

    if has_endo:
        text_lines.append(f"*** ATTENTION: ENDOSCOPY LIST CLASHES DETECTED ({len(endo_clashes)}) ***")
        text_lines.append(f"Notified: {ENDOSCOPY_WAITINGLIST_EMAIL}")
        for c in endo_clashes:
            dt = c.get("date", "")
            sess = c.get("session", "")
            room = c.get("room", c.get("room_name", ""))
            lt = c.get("listType", c.get("list_type", ""))
            cov = c.get("coverDoctor", c.get("covering_staff_name", "Vacant/Requires Cover"))
            text_lines.append(f"  • {dt} ({sess}) - {room} [{lt}] | Cover: {cov}")
        text_lines.append("")

    if has_clinic:
        text_lines.append(f"*** ATTENTION: CLINIC CLASHES DETECTED ({len(clinic_clashes)}) ***")
        text_lines.append(f"Notified: {CLINIC_COORDINATION_EMAIL}")
        for cl in clinic_clashes:
            dt = cl.get("date", "")
            name = cl.get("clinic_name", "")
            cov = cl.get("covering_staff_name", "Vacant/Requires Cover")
            text_lines.append(f"  • {dt} - {name} | Cover: {cov}")
        text_lines.append("")

    if not has_endo and not has_clinic:
        text_lines.append("No clashes detected with 4-week Endoscopy theatre grid or Outpatient clinics.")
        text_lines.append("")

    text_lines.append("The official St Vincent's Hospital Leave Application PDF is attached.")
    plain_text = "\n".join(text_lines)

    # HTML body with clean clinical styling
    html_endo_rows = "".join([
        f"""<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;font-weight:600;">{c.get('date', '')} ({c.get('session', '')})</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;">{c.get('room', c.get('room_name', ''))} ({c.get('listType', c.get('list_type', ''))})</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;color:#991b1b;font-weight:500;">{c.get('coverDoctor', c.get('covering_staff_name') or 'Needs Cover / Vacant')}</td>
        </tr>""" for c in endo_clashes
    ]) if has_endo else ""

    html_clinic_rows = "".join([
        f"""<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;font-weight:600;">{cl.get('date', '')} ({cl.get('day_of_week', '')})</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;">{cl.get('clinic_name', '')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;color:#92400e;font-weight:500;">{cl.get('covering_staff_name') or 'Needs Cover / Vacant'}</td>
        </tr>""" for cl in clinic_clashes
    ]) if has_clinic else ""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }}
  .container {{ max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; }}
  .header {{ background: #1e3a8a; color: #ffffff; padding: 20px 24px; }}
  .header h1 {{ margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }}
  .header p {{ margin: 4px 0 0 0; font-size: 12px; color: #93c5fd; }}
  .content {{ padding: 24px; }}
  .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }}
  .badge-app {{ background: #eff6ff; color: #1d4ed8; }}
  table.details {{ width: 100%; border-collapse: collapse; margin-top: 14px; margin-bottom: 20px; font-size: 13px; }}
  table.details td {{ padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }}
  table.details td.label {{ width: 34%; font-weight: 600; color: #64748b; }}
  table.details td.value {{ font-weight: 500; color: #0f172a; }}
  .alert-box {{ border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; font-size: 12px; }}
  .alert-red {{ background: #fff1f2; border: 1px solid #fecdd3; color: #9f1239; }}
  .alert-amber {{ background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }}
  .alert-green {{ background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }}
  .clash-table {{ width: 100%; border-collapse: collapse; margin-top: 8px; background: #ffffff; border-radius: 6px; overflow: hidden; font-size: 12px; }}
  .footer {{ background: #f1f5f9; padding: 14px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }}
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>St Vincent's Hospital Melbourne</h1>
      <p>Department of Gastroenterology &bull; Official Leave Application</p>
    </div>
    <div class="content">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="badge badge-app">{leave_type}</span>
        <span style="font-size: 12px; color: #64748b;">Lodged via Gastro Dept Portal</span>
      </div>

      <table class="details">
        <tr><td class="label">Staff Member:</td><td class="value"><strong>{staff_name}</strong></td></tr>
        <tr><td class="label">Employee Number:</td><td class="value">{emp_no}</td></tr>
        <tr><td class="label">Leave Period:</td><td class="value"><strong>{start_date}</strong> &rarr; <strong>{end_date}</strong></td></tr>
        <tr><td class="label">Total Hours / Days:</td><td class="value">{hours or 'As rostered'}</td></tr>
        <tr><td class="label">Approving Manager:</td><td class="value">{manager}</td></tr>
        <tr><td class="label">Coordinator:</td><td class="value">{COORDINATOR_EMAIL}</td></tr>
      </table>

      {f'''
      <div class="alert-box alert-red">
        <strong>&bull; Endoscopy Waiting List Clashes Detected ({len(endo_clashes)})</strong><br>
        <span>This period overlaps with scheduled endoscopy lists. Notified: <code>{ENDOSCOPY_WAITINGLIST_EMAIL}</code></span>
        <table class="clash-table">
          <tr style="background:#ffe4e6;color:#881337;font-weight:600;">
            <th style="padding:6px 10px;text-align:left;">Date & Session</th>
            <th style="padding:6px 10px;text-align:left;">Room & List</th>
            <th style="padding:6px 10px;text-align:left;">Cover Doctor</th>
          </tr>
          {html_endo_rows}
        </table>
      </div>
      ''' if has_endo else ''}

      {f'''
      <div class="alert-box alert-amber">
        <strong>&bull; Outpatient Clinic Clashes Detected ({len(clinic_clashes)})</strong><br>
        <span>This period overlaps with outpatient clinics. Notified: <code>{CLINIC_COORDINATION_EMAIL}</code></span>
        <table class="clash-table">
          <tr style="background:#fef3c7;color:#78350f;font-weight:600;">
            <th style="padding:6px 10px;text-align:left;">Date</th>
            <th style="padding:6px 10px;text-align:left;">Clinic Name</th>
            <th style="padding:6px 10px;text-align:left;">Cover Doctor</th>
          </tr>
          {html_clinic_rows}
        </table>
      </div>
      ''' if has_clinic else ''}

      {'''
      <div class="alert-box alert-green">
        &check; <strong>No Endoscopy or Clinic Clashes</strong>: No conflicts detected against the 4-week theatre grid or clinic roster.
      </div>
      ''' if not has_endo and not has_clinic else ''}

      <p style="font-size:12px;color:#475569;margin-top:16px;">
        &bull; <strong>Attachment:</strong> The official filled St Vincent's Hospital Leave Application PDF is attached to this email and has been downloaded to the applicant's computer.
      </p>
    </div>
    <div class="footer">
      Sent automatically by Gastroenterology Department Roster System &bull; St Vincent's Hospital Melbourne
    </div>
  </div>
</body>
</html>"""

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain_text, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    # Attach PDF
    clean_staff = re.sub(r'[^a-zA-Z0-9_-]', '_', staff_name)
    clean_start = re.sub(r'[^a-zA-Z0-9_-]', '_', start_date)
    filename = f"Leave_Application_{clean_staff}_{clean_start}.pdf"

    pdf_part = MIMEApplication(pdf_bytes, _subtype="pdf")
    pdf_part.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(pdf_part)

    return msg, all_envelope

def send_leave_email(
    leave_data: Dict[str, Any],
    pdf_bytes: bytes,
    endo_clashes: List[Dict[str, Any]],
    clinic_clashes: List[Dict[str, Any]]
) -> Dict[str, Any]:
    msg, recipients = build_leave_email(leave_data, pdf_bytes, endo_clashes, clinic_clashes)

    if not GMAIL_APP_PASSWORD:
        return {
            "success": False,
            "simulated": True,
            "recipients": recipients,
            "message": "Gmail App Password not configured in environment or .env file. Email queued/simulated."
        }

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg, from_addr=GMAIL_USER, to_addrs=recipients)
        server.quit()
        return {
            "success": True,
            "simulated": False,
            "recipients": recipients,
            "message": f"Leave application emailed to: {', '.join(recipients)}"
        }
    except Exception as exc:
        return {
            "success": False,
            "simulated": False,
            "recipients": recipients,
            "error": str(exc),
            "message": f"Failed to send email via Gmail SMTP: {str(exc)}"
        }
