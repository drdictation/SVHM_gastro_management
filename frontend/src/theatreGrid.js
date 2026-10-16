import * as XLSX from "xlsx";

// Anchor: Monday 2026-11-02 is Week 3 of the 4-week repeating Theatre Grid cycle
export const CYCLE_ANCHOR_MONDAY = "2026-11-02";
export const CYCLE_ANCHOR_WEEK = 3; // 1..4

export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const GASTRO_ROOMS = [
  { key: "ENDO 1", label: "Endo Room 1", defaultType: "ENDO", site: "Fitzroy Endo" },
  { key: "ENDO 2", label: "Endo Room 2", defaultType: "ENDO", site: "Fitzroy Endo" },
  { key: "ENDO 3", label: "Endo Room 3", defaultType: "ENDO", site: "Fitzroy Endo" },
  { key: "THEATRE 1", label: "Theatre 1 (Endo)", defaultType: "Gas/Colon", site: "St George's / T1&T4" },
  { key: "THEATRE 4", label: "Theatre 4 (Endo)", defaultType: "Gas/Colon", site: "St George's / T1&T4" }
];

// Explicit alias map for Theatre Grid shorthand / typos -> canonical surname/full match
const GRID_NAME_ALIASES = {
  "r.chen": "Dr Robert Chen",
  "a.taylor": "Assoc Prof Andrew Taylor",
  "t he": "Dr Tony He",
  "tony he": "Dr Tony He",
  "l anderson": "Dr Lauren Andersson",
  "l.anderson": "Dr Lauren Andersson",
  "kathyrn gazelakis": "Dr Kathryn Gazelakis",
  "k gazelakis": "Dr Kathryn Gazelakis",
  "k.gazelakis": "Dr Kathryn Gazelakis",
  "m.ryan": "Assoc Prof Marno Ryan",
  "j.howell": "Assoc Prof Jessica Howell",
  "e flanagan": "Dr Emma Flanagan",
  "e.flanagan": "Dr Emma Flanagan",
  "t fox": "Dr Tara Fox",
  "t.fox": "Dr Tara Fox",
  "n clarke": "Dr Nick Clark",
  "n.clarke": "Dr Nick Clark",
  "n clark": "Dr Nick Clark",
  "a.thompson": "Prof. Alex Thompson",
  "fellow- f jones": "Dr Fiona Jones",
  "f jones": "Dr Fiona Jones",
  "j holmes": "Assoc Prof Jacinta Holmes",
  "j.holmes": "Assoc Prof Jacinta Holmes",
  "d.iser": "Dr David Iser",
  "s.fehily": "Dr Sasha Fehily",
  "j.ding": "Assoc Prof John Nik Ding",
  "john ding": "Assoc Prof John Nik Ding",
  "b.holt": "Assoc Prof Bronte Holt",
  "s.hume": "Dr Sam Hume",
  "t papaluca": "Dr Tim Papaluca",
  "t.papaluca": "Dr Tim Papaluca",
  "m.de gregoriou": "Dr Michael De Gregorio",
  "m.de gregorio": "Dr Michael De Gregorio",
  "e.wright": "Assoc Prof Emily Wright",
  "b.demediuk": "Dr Barbara Demediuk",
  "o. niewiadomski": "Dr Ola Niewiadomski",
  "o.niewiadomski": "Dr Ola Niewiadomski",
  "g lovett": "Dr Grace Lovett",
  "g.lovett": "Dr Grace Lovett",
  "a farrell": "Dr Ann Farrell",
  "a.farrell": "Dr Ann Farrell",
  "a. miller": "Assoc Prof Ashley Miller",
  "a.miller": "Assoc Prof Ashley Miller",
  "c.basnayake": "Dr Chamara Basnayake",
  "r prentice": "Dr Ralley Prentice",
  "r.prentice": "Dr Ralley Prentice",
  "e.tsoi": "Dr Edward Tsoi",
  "fellow": "Fellow List"
};

function stripTitles(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/^(assoc\.?\s+prof\.?|prof\.?|dr\.?|mr\.?|ms\.?|fellow\s*-\s*)\s*/i, "")
    .trim();
}

export function resolveGridDoctorName(rawCell, staffList = []) {
  const cleaned = String(rawCell || "").replace(/\u00a0/g, " ").trim();
  if (!cleaned) return "Vacant";
  const lower = cleaned.toLowerCase().replace(/\s+/g, " ");
  if (GRID_NAME_ALIASES[lower]) {
    return GRID_NAME_ALIASES[lower];
  }

  const noTitle = stripTitles(cleaned);
  const noTitleLower = noTitle.toLowerCase();
  if (GRID_NAME_ALIASES[noTitleLower]) {
    return GRID_NAME_ALIASES[noTitleLower];
  }

  // Match initial + surname like "C.Basnayake" or "A. Miller"
  const initMatch = noTitle.match(/^([A-Za-z])[\.\s]+([A-Za-z\-\s]+)$/);
  if (initMatch && staffList.length > 0) {
    const initial = initMatch[1].toLowerCase();
    const surname = initMatch[2].trim().toLowerCase();
    for (const s of staffList) {
      const parts = stripTitles(s.name).toLowerCase().split(/\s+/);
      const sFirst = parts[0] || "";
      const sLast = parts[parts.length - 1] || "";
      if (sFirst.startsWith(initial) && (sLast === surname || sLast.startsWith(surname) || surname.startsWith(sLast))) {
        return s.name;
      }
    }
  }

  for (const s of staffList) {
    const sClean = stripTitles(s.name).toLowerCase();
    if (sClean === noTitleLower || sClean.includes(noTitleLower) || noTitleLower.includes(sClean)) {
      return s.name;
    }
  }

  return cleaned;
}

export function matchDoctorName(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const resolveCanonical = (n) => {
    const low = String(n).replace(/\u00a0/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
    if (GRID_NAME_ALIASES[low]) return stripTitles(GRID_NAME_ALIASES[low]).toLowerCase();
    const stripped = stripTitles(n).toLowerCase();
    if (GRID_NAME_ALIASES[stripped]) return stripTitles(GRID_NAME_ALIASES[stripped]).toLowerCase();
    return stripped;
  };

  const a = resolveCanonical(nameA);
  const b = resolveCanonical(nameB);
  if (!a || !b || a === "vacant" || b === "vacant") return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  // Check initial + surname match
  const partsA = a.split(/[\s\.]+/).filter(Boolean);
  const partsB = b.split(/[\s\.]+/).filter(Boolean);
  if (partsA.length >= 2 && partsB.length >= 2) {
    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    const firstInitA = partsA[0][0];
    const firstInitB = partsB[0][0];
    if (firstInitA === firstInitB && (lastA === lastB || lastA.replace(/u$/, "") === lastB.replace(/u$/, "") || lastA.replace(/ss/g, "s") === lastB.replace(/ss/g, "s"))) {
      return true;
    }
  }
  return false;
}

// Parse YYYY-MM-DD safely in local time
export function parseLocalYMD(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDDMMYYYY(dateInput) {
  if (!dateInput) return "";
  if (String(dateInput).toUpperCase() === "TBC") return "TBC";
  const str = String(dateInput).slice(0, 10);
  const parts = str.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export function getMondayOfDate(dateStr) {
  const d = parseLocalYMD(dateStr);
  if (!d) return null;
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatLocalYMD(d);
}

export function addDaysYMD(dateStr, days) {
  const d = parseLocalYMD(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return formatLocalYMD(d);
}

// Compute Theatre Grid Cycle Week (1..4) for any YYYY-MM-DD date
export function getCycleWeek(dateStr) {
  const mondayStr = getMondayOfDate(dateStr);
  if (!mondayStr) return 3;
  const monday = parseLocalYMD(mondayStr);
  const anchor = parseLocalYMD(CYCLE_ANCHOR_MONDAY);
  const diffDays = Math.round((monday - anchor) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  // CYCLE_ANCHOR_WEEK is 3 (zero-indexed 2)
  const zeroBased = (((CYCLE_ANCHOR_WEEK - 1 + diffWeeks) % 4) + 4) % 4;
  return zeroBased + 1;
}

// Canonical Week 3 extracted from 'Theatre Grid 2026(Nov 2nd 2026).csv'
export const WEEK_3_BASE_SESSIONS = [
  // MONDAY
  { day: "Monday", dayIndex: 0, session: "AM", startTime: "09:00", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Robert Chen", raw_doctor: "R.Chen" },
  { day: "Monday", dayIndex: 0, session: "AM", startTime: "09:00", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Andrew Taylor", raw_doctor: "A.Taylor" },
  { day: "Monday", dayIndex: 0, session: "AM", startTime: "08:30", room: "ENDO 3", listType: "ENDO 3", site: "Fitzroy Endo", staff_name: "Dr Tony He", raw_doctor: "T HE" },
  { day: "Monday", dayIndex: 0, session: "AM", startTime: "08:00", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Lauren Andersson", raw_doctor: "L Anderson" },
  { day: "Monday", dayIndex: 0, session: "AM", startTime: "08:00", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Kathryn Gazelakis", raw_doctor: "Kathyrn Gazelakis" },
  { day: "Monday", dayIndex: 0, session: "PM", startTime: "13:30", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Marno Ryan", raw_doctor: "M.Ryan" },
  { day: "Monday", dayIndex: 0, session: "PM", startTime: "13:30", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Jessica Howell", raw_doctor: "J.Howell" },
  { day: "Monday", dayIndex: 0, session: "PM", startTime: "13:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Emma Flanagan", raw_doctor: "E Flanagan" },
  { day: "Monday", dayIndex: 0, session: "PM", startTime: "13:30", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Tara Fox", raw_doctor: "T Fox" },

  // TUESDAY
  { day: "Tuesday", dayIndex: 1, session: "AM", startTime: "09:00", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Nick Clark", raw_doctor: "N Clarke" },
  { day: "Tuesday", dayIndex: 1, session: "AM", startTime: "09:00", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Prof. Alex Thompson", raw_doctor: "A.Thompson" },
  { day: "Tuesday", dayIndex: 1, session: "AM", startTime: "08:00", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Fiona Jones", raw_doctor: "Fellow- F Jones" },
  { day: "Tuesday", dayIndex: 1, session: "AM", startTime: "08:00", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Kathryn Gazelakis", raw_doctor: "Kathyrn Gazelakis" },
  { day: "Tuesday", dayIndex: 1, session: "PM", startTime: "13:30", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Jacinta Holmes", raw_doctor: "J Holmes" },
  { day: "Tuesday", dayIndex: 1, session: "PM", startTime: "13:30", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Kathryn Gazelakis", raw_doctor: "K Gazelakis" },
  { day: "Tuesday", dayIndex: 1, session: "PM", startTime: "13:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr David Iser", raw_doctor: "D.Iser" },
  { day: "Tuesday", dayIndex: 1, session: "PM", startTime: "13:30", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Sasha Fehily", raw_doctor: "S.Fehily" },

  // WEDNESDAY
  { day: "Wednesday", dayIndex: 2, session: "AM", startTime: "09:00", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof John Nik Ding", raw_doctor: "J.Ding" },
  { day: "Wednesday", dayIndex: 2, session: "AM", startTime: "09:00", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Tony He", raw_doctor: "T He" },
  { day: "Wednesday", dayIndex: 2, session: "AM", startTime: "09:00", room: "ENDO 3", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Bronte Holt", raw_doctor: "B.Holt" },
  { day: "Wednesday", dayIndex: 2, session: "AM", startTime: "08:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Vacant", raw_doctor: "" },
  { day: "Wednesday", dayIndex: 2, session: "AM", startTime: "08:30", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Fellow List", raw_doctor: "Fellow" },
  { day: "Wednesday", dayIndex: 2, session: "PM", startTime: "13:30", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Bronte Holt", raw_doctor: "B.Holt" },
  { day: "Wednesday", dayIndex: 2, session: "PM", startTime: "13:30", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Sam Hume", raw_doctor: "S.Hume" },
  { day: "Wednesday", dayIndex: 2, session: "PM", startTime: "13:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Tim Papaluca", raw_doctor: "T Papaluca" },
  { day: "Wednesday", dayIndex: 2, session: "PM", startTime: "13:30", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Michael De Gregorio", raw_doctor: "M.De Gregoriou" },

  // THURSDAY
  { day: "Thursday", dayIndex: 3, session: "AM", startTime: "09:00", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Emily Wright", raw_doctor: "E.Wright" },
  { day: "Thursday", dayIndex: 3, session: "AM", startTime: "09:00", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Barbara Demediuk", raw_doctor: "B.Demediuk" },
  { day: "Thursday", dayIndex: 3, session: "AM", startTime: "08:00", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Ola Niewiadomski", raw_doctor: "O. Niewiadomski" },
  { day: "Thursday", dayIndex: 3, session: "AM", startTime: "08:00", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Grace Lovett", raw_doctor: "G Lovett" },
  { day: "Thursday", dayIndex: 3, session: "PM", startTime: "13:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Tara Fox", raw_doctor: "T Fox" },
  { day: "Thursday", dayIndex: 3, session: "PM", startTime: "13:30", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Ann Farrell", raw_doctor: "A Farrell" },

  // FRIDAY
  { day: "Friday", dayIndex: 4, session: "AM", startTime: "09:00", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Ashley Miller", raw_doctor: "A. Miller" },
  { day: "Friday", dayIndex: 4, session: "AM", startTime: "09:00", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Chamara Basnayake", raw_doctor: "C.Basnayake" },
  { day: "Friday", dayIndex: 4, session: "AM", startTime: "08:00", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Tony He", raw_doctor: "TONY HE" },
  { day: "Friday", dayIndex: 4, session: "AM", startTime: "08:00", room: "THEATRE 4", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Ralley Prentice", raw_doctor: "R Prentice" },
  { day: "Friday", dayIndex: 4, session: "PM", startTime: "13:30", room: "ENDO 1", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Assoc Prof Bronte Holt", raw_doctor: "B.Holt" },
  { day: "Friday", dayIndex: 4, session: "PM", startTime: "13:30", room: "ENDO 2", listType: "ENDO", site: "Fitzroy Endo", staff_name: "Dr Edward Tsoi", raw_doctor: "E.Tsoi" },
  { day: "Friday", dayIndex: 4, session: "PM", startTime: "13:30", room: "THEATRE 1", listType: "Gas/Colon", site: "St George's / T1&T4", staff_name: "Dr Lauren Andersson", raw_doctor: "L Anderson" }
];

import theatreGridWeeksData from "./theatre_grid_weeks.json";

export function createDefaultTheatreTemplates() {
  return JSON.parse(JSON.stringify(theatreGridWeeksData));
}

// Parse Hospital Theatre Grid CSV or XLSX and extract ONLY "ENDO" (incl. ENDO 1-3) and "Gas/Colon" lists
export async function parseTheatreGridFile(file, staffList = [], overrideWeekNum = null) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", raw: true });
  const resultsByWeek = {};

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows || rows.length < 6) continue;

    // Detect Week Number & Header Row
    let detectedWeek = overrideWeekNum || null;
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const rowStr = rows[r].map(c => String(c || "").trim()).join(" ");
      const wm = rowStr.match(/Week\s*(\d)/i);
      if (wm && !overrideWeekNum) {
        detectedWeek = Number(wm[1]);
      }
      if (rowStr.toUpperCase().includes("ENDO 1") || rowStr.toUpperCase().includes("THEATRE 1")) {
        headerRowIdx = r;
      }
    }
    if (!detectedWeek && sheetName) {
      const swm = sheetName.match(/Week\s*(\d)/i);
      if (swm) detectedWeek = Number(swm[1]);
    }
    if (!detectedWeek || detectedWeek < 1 || detectedWeek > 4) {
      detectedWeek = 3;
    }
    if (headerRowIdx === -1) headerRowIdx = 3;

    const roomHeaders = (rows[headerRowIdx] || []).map(x => String(x || "").trim());
    const sessions = [];
    let currentDay = null;
    let currentDayIdx = -1;

    for (let r = headerRowIdx + 1; r < rows.length - 1; r++) {
      const row = rows[r] || [];
      const c0 = String(row[0] || "").trim().toUpperCase();
      DAYS_OF_WEEK.forEach((d, idx) => {
        if (c0.includes(d.toUpperCase())) {
          currentDay = d;
          currentDayIdx = idx;
        }
      });

      const c1 = String(row[1] || "").trim().toUpperCase();
      if (c1 === "AM" || c1 === "PM") {
        const docRow = rows[r + 1] || [];
        const timeRow = rows[r - 1] || [];
        const docDayCell = String(docRow[0] || "").trim().toUpperCase();
        DAYS_OF_WEEK.forEach((d, idx) => {
          if (docDayCell.includes(d.toUpperCase())) {
            currentDay = d;
            currentDayIdx = idx;
          }
        });

        if (!currentDay) continue;

        for (let col = 2; col < row.length; col++) {
          const spec = String(row[col] || "").replace(/\u00a0/g, " ").trim();
          // Strictly match ENDO (incl. ENDO 1/2/3) or Gas/Colon (case-insensitive)
          if (/^(endo(\s*\d+)?|gas\s*\/\s*colon)$/i.test(spec)) {
            const rawDoc = String(docRow[col] || "").replace(/\u00a0/g, " ").trim();
            const resolvedDoc = resolveGridDoctorName(rawDoc, staffList);
            const rawRoom = roomHeaders[col] || `Col ${col}`;
            const isGasColon = /gas\s*\/\s*colon/i.test(spec);
            const site = isGasColon ? "St George's / T1&T4" : "Fitzroy Endo";
            const startTime = c1 === "PM" ? "13:30" : String(timeRow[col] || (isGasColon ? "08:00" : "09:00")).trim();

            sessions.push({
              id: `w${detectedWeek}_${currentDay.toLowerCase()}_${c1.toLowerCase()}_${rawRoom.replace(/\s+/g, "").toLowerCase()}_${sessions.length}`,
              day: currentDay,
              dayIndex: currentDayIdx,
              session: c1,
              startTime,
              room: rawRoom,
              listType: isGasColon ? "Gas/Colon" : spec.toUpperCase(),
              site,
              staff_name: resolvedDoc,
              raw_doctor: rawDoc
            });
          }
        }
      }
    }

    if (sessions.length > 0) {
      resultsByWeek[detectedWeek] = {
        weekNumber: detectedWeek,
        label: `Week ${detectedWeek}`,
        isDefaultFromWeek3: false,
        sourceFile: file.name,
        sessions
      };
    }
  }

  return resultsByWeek;
}

// Check if a doctor has leave overlapping a specific YYYY-MM-DD date (and optional AM/PM session)
export function findDoctorLeaveOnDate(staffName, dateStr, sessionAmPm, leaveApplications = []) {
  if (!staffName || staffName === "Vacant" || staffName === "Fellow List") return null;
  for (const lv of leaveApplications) {
    if (lv.status === "rejected") continue;
    if (!matchDoctorName(lv.staff_name, staffName)) continue;
    const start = lv.start_date;
    const end = lv.end_date === "TBC" ? "2027-12-31" : (lv.end_date || lv.start_date);
    if (!start) continue;
    if (dateStr >= start && dateStr <= end) {
      // Check if leave is session-restricted like "PM (FGC) Only" or "AM Only"
      const lType = String(lv.leave_type || "").toUpperCase();
      if (sessionAmPm === "AM" && lType.includes("PM") && lType.includes("ONLY")) {
        continue;
      }
      if (sessionAmPm === "PM" && lType.includes("AM") && lType.includes("ONLY")) {
        continue;
      }
      return lv;
    }
  }
  return null;
}

// Build the full Endoscopy schedule for a given Monday (YYYY-MM-DD) with live Leave Clashes & Cover
export function getWeekEndoSchedule(weekMonday, theatreTemplates, leaveApplications = [], endoOverrides = {}) {
  const cycleWeek = getCycleWeek(weekMonday);
  const template = (theatreTemplates && theatreTemplates[cycleWeek]) || createDefaultTheatreTemplates()[cycleWeek];
  const sessions = (template?.sessions || []).map(s => {
    const dateStr = addDaysYMD(weekMonday, s.dayIndex);
    const overrideKey = `${dateStr}_${s.session}_${s.room}`;
    const override = endoOverrides[overrideKey] || null;
    const leaveClash = findDoctorLeaveOnDate(s.staff_name, dateStr, s.session, leaveApplications);
    const coverFromLeave = leaveClash?.allowances || "";
    const coverDoctor = override?.cover_staff_name ?? coverFromLeave;
    const coverStatus = override?.status || (coverDoctor ? "covered" : leaveClash ? "needs_cover" : "scheduled");

    return {
      ...s,
      date: dateStr,
      cycleWeek,
      overrideKey,
      leaveClash,
      coverDoctor,
      coverStatus
    };
  });

  return {
    weekMonday,
    cycleWeek,
    isDefaultFromWeek3: Boolean(template?.isDefaultFromWeek3),
    sourceFile: template?.sourceFile || "",
    sessions
  };
}

// Find all Theatre Grid (ENDO / Gas/Colon) + Department Roster clashes for a leave date range
export function findLeaveClashes(
  staffName,
  startDate,
  endDate,
  theatreTemplates,
  rosterEntries = [],
  endoOverrides = {}
) {
  if (!staffName || !startDate) {
    return { endoClashes: [], rosterClashes: [], cycleWeeks: [], affectedSites: [] };
  }
  const effectiveEnd = (!endDate || endDate === "TBC") ? addDaysYMD(startDate, 90) : endDate;
  const startDt = parseLocalYMD(startDate);
  const endDt = parseLocalYMD(effectiveEnd);
  if (!startDt || !endDt || endDt < startDt) {
    return { endoClashes: [], rosterClashes: [], cycleWeeks: [], affectedSites: [] };
  }

  const totalDays = Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1;
  // Cap day-by-day iteration at 120 days so 1-year sabbatical leaves stay instantaneous
  const maxDaysToScan = Math.min(totalDays, 120);

  const endoClashes = [];
  const cycleWeekSet = new Set();
  const siteSet = new Set();

  for (let i = 0; i < maxDaysToScan; i++) {
    const curDate = addDaysYMD(startDate, i);
    const dObj = parseLocalYMD(curDate);
    const jsDay = dObj.getDay(); // 0=Sun, 1=Mon..5=Fri, 6=Sat
    if (jsDay === 0 || jsDay === 6) continue; // Mon-Fri only for regular theatre grid
    const dayIndex = jsDay - 1;
    const cw = getCycleWeek(curDate);
    cycleWeekSet.add(cw);

    const template = (theatreTemplates && theatreTemplates[cw]) || createDefaultTheatreTemplates()[cw];
    for (const s of template?.sessions || []) {
      if (s.dayIndex === dayIndex && matchDoctorName(s.staff_name, staffName)) {
        const overrideKey = `${curDate}_${s.session}_${s.room}`;
        const override = endoOverrides[overrideKey] || null;
        endoClashes.push({
          ...s,
          date: curDate,
          cycleWeek: cw,
          overrideKey,
          coverDoctor: override?.cover_staff_name || ""
        });
        siteSet.add(`${s.room} (${s.listType})`);
      }
    }
  }

  // Also check department roster entries (Oncall, Wards, Consults, GICC, Friday JC, IBD Meeting)
  const rosterClashes = rosterEntries.filter(e => {
    if (!e.date) return false;
    if (e.date < startDate || e.date > effectiveEnd) return false;
    return matchDoctorName(e.staff_name, staffName);
  });

  return {
    endoClashes,
    rosterClashes,
    cycleWeeks: Array.from(cycleWeekSet),
    affectedSites: Array.from(siteSet),
    isTruncated: totalDays > maxDaysToScan,
    totalDays
  };
}
