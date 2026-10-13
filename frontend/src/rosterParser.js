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
