import * as XLSX from "xlsx";

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date to JS Date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Match d/m/y or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

export async function parseRosterFile(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const entries = [];

  // 1. Check for SMS sheet pattern
  if (workbook.SheetNames.includes("Sheet1")) {
    const ws = workbook.Sheets["Sheet1"];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    // Rows 10+ typically contain schedule
    for (let r = 9; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[2]) continue;
      const dateStr = parseExcelDate(row[2]);
      if (!dateStr) continue;

      const holiday = row[0] ? String(row[0]).trim() : null;

      // Col 11: Registrar (index 11)
      if (row[11]) {
        const name = String(row[11]).trim();
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: "hm_oncall",
          date: dateStr,
          day_of_week: "Monday-Sunday",
          title: "H&M Oncall Registrar",
          staff_name: name,
          role_label: "Registrar",
          holiday,
          original_staff_name: name,
        });
      }

      // Col 13: Consultant (index 13)
      if (row[13]) {
        const name = String(row[13]).trim();
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: "hm_oncall",
          date: dateStr,
          day_of_week: "Monday-Sunday",
          title: "H&M Oncall Consultant",
          staff_name: name,
          role_label: "Consultant",
          holiday,
          original_staff_name: name,
        });
      }

      // Col 16: IBD Wards (index 16)
      if (row[16]) {
        const name = String(row[16]).trim();
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: "ibd_wards",
          date: dateStr,
          day_of_week: "Monday-Sunday",
          title: "IBD Ward Service",
          staff_name: name,
          role_label: "Consultant",
          holiday,
          original_staff_name: name,
        });
      }

      // Col 18: Liver Wards (index 18)
      if (row[18]) {
        const name = String(row[18]).trim();
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: "liver_wards",
          date: dateStr,
          day_of_week: "Monday-Sunday",
          title: "Liver Ward Service",
          staff_name: name,
          role_label: "Consultant",
          holiday,
          original_staff_name: name,
        });
      }

      // Col 20: Consults (index 20)
      if (row[20]) {
        const name = String(row[20]).trim();
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: "consults",
          date: dateStr,
          day_of_week: "Monday-Sunday",
          title: "Consults Consultant",
          staff_name: name,
          role_label: "Consultant",
          holiday,
          original_staff_name: name,
        });
      }
    }
  }

  // 2. Generic table fallback (columns: Date, Title, Staff, Role, Type)
  if (entries.length === 0) {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    for (const row of rows) {
      const dateVal = parseExcelDate(row.Date || row.date || row.DATE);
      const staffVal = row.Staff || row.staff || row.Name || row.name || row["Staff Name"];
      if (dateVal && staffVal) {
        entries.push({
          id: Date.now() + Math.random(),
          entry_type: row.Type || row.type || "general",
          date: dateVal,
          day_of_week: row.Day || "Standard",
          title: row.Title || row.title || "Duty Shift",
          staff_name: String(staffVal).trim(),
          role_label: row.Role || row.role || "Consultant",
          notes: row.Notes || row.notes || "",
          original_staff_name: String(staffVal).trim(),
        });
      }
    }
  }

  return entries;
}

const MONTH_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

export function parseLeaveDate(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s) return null;
  if (s.toLowerCase() === "tbc") return "TBC";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Match DD-MMM-YY or DD-MMM-YYYY (e.g. 26-Jul-26)
  const mAlpha = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[\s\-\/](\d{2,4})$/);
  if (mAlpha) {
    const day = mAlpha[1].padStart(2, "0");
    const mon = MONTH_MAP[mAlpha[2].toLowerCase()];
    let year = mAlpha[3];
    if (year.length === 2) year = `20${year}`;
    if (mon) return `${year}-${mon}-${day}`;
  }

  return parseExcelDate(s);
}

function normalizeLeaveType(rawType) {
  const t = String(rawType || "").trim();
  if (!t) return "Annual Leave";
  const map = {
    "annual": "Annual Leave",
    "sabbatical": "Sabbatical",
    "parental": "Parental Leave",
    "parental/annual/lsl": "Parental / Annual / LSL",
    "annual/sabbatical": "Annual / Sabbatical",
    "long service": "Long Service Leave",
    "pm (fgc) only": "PM (FGC) Only"
  };
  return map[t.toLowerCase()] || t;
}

function matchStaffTitle(rawName, staffList = []) {
  const raw = String(rawName || "").trim();
  if (!raw || raw.endsWith("?")) return null;
  const rawLower = raw.toLowerCase();
  for (const s of staffList) {
    const sClean = s.name
      .toLowerCase()
      .replace(/^(assoc\.?\s+prof\.?|prof\.?|dr\.?|mr\.?|ms\.?)\s+/i, "")
      .trim();
    if (rawLower === "john ding" && sClean.includes("john") && sClean.includes("ding")) {
      return s.name;
    }
    if (rawLower === sClean || sClean.includes(rawLower) || rawLower.includes(sClean)) {
      return s.name;
    }
  }
  return /^(dr|prof|assoc)/i.test(raw) ? raw : `Dr ${raw}`;
}

export async function parseLeaveFile(file, staffList = []) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", raw: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
  const records = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawName = String(row["Name"] || row["Staff Name"] || row["Staff"] || row["name"] || "").trim();
    const rawStart = row["Leave start date"] || row["Start Date"] || row["start_date"] || "";
    const rawEnd = row["Leave end date"] || row["End Date"] || row["end_date"] || "";
    const rawType = row["Type"] || row["Leave Type"] || row["leave_type"] || "";
    const rawSite = row["SITE  (ENDOSCOPY USE ONLY)"] || row["SITE (ENDOSCOPY USE ONLY)"] || row["Site"] || "";
    const rawCover = row["COVER  (ENDOSCOPY USE ONLY)"] || row["COVER (ENDOSCOPY USE ONLY)"] || row["Cover"] || "";

    if (!rawName || rawName.endsWith("?")) continue;
    const startDate = parseLeaveDate(rawStart);
    if (!startDate) continue;
    const endDate = parseLeaveDate(rawEnd) || startDate;
    const staffName = matchStaffTitle(rawName, staffList);
    if (!staffName) continue;

    records.push({
      id: Date.now() + i,
      staff_name: staffName,
      employee_number: "",
      department: "Gastroenterology",
      pay_in_advance: "No",
      leave_type: normalizeLeaveType(rawType),
      start_date: startDate,
      end_date: endDate,
      leave_hours: "",
      leave_balance: "",
      costing: String(rawSite || "").trim(),
      allowances: String(rawCover || "").trim(),
      submission_date: new Date().toISOString().slice(0, 10),
      status: "approved",
      manager_name: "Prof. Alex Thompson",
      created_at: new Date().toISOString()
    });
  }

  return records;
}

