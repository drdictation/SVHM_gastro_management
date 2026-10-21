import { PDFDocument } from "pdf-lib";

function formatAusDate(val) {
  if (!val) return "";
  val = String(val).trim();
  if (val.includes("/")) {
    const parts = val.split("/");
    if (parts.length === 3) {
      return `${String(parts[0]).padStart(2, "0")}/${String(parts[1]).padStart(2, "0")}/${parts[2]}`;
    }
  }
  if (val.includes("-")) {
    const parts = val.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${String(parts[2]).padStart(2, "0")}/${String(parts[1]).padStart(2, "0")}/${parts[0]}`;
      }
      return `${String(parts[0]).padStart(2, "0")}/${String(parts[1]).padStart(2, "0")}/${parts[2]}`;
    }
  }
  return val;
}

export async function generateLeavePdf(formData) {
  // Fetch original official hospital PDF template from public assets
  const templateBytes = await fetch("/Leave_Application_Template.pdf").then((res) => {
    if (!res.ok) throw new Error("Failed to load official Leave Application template PDF.");
    return res.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const setTextSafe = (fieldId, text) => {
    try {
      const field = form.getTextField(fieldId);
      if (field) field.setText(String(text ?? ""));
    } catch {
      // ignore non-existent or differently typed fields
    }
  };

  const setDropdownSafe = (fieldId, val) => {
    try {
      const field = form.getDropdown(fieldId);
      if (field && val) {
        field.select(val);
      }
    } catch {
      // fallback if option doesn't match
    }
  };

  const prefix = "OLAEPEDNIPIIEHEPLMFFHJKACDMKJICL.form1.x.";

  // 1. Employee Name, Number, Dept
  setTextSafe(`${prefix}f1`, formData.staff_name || "");
  setTextSafe(`${prefix}f2`, formData.employee_number || "");
  setTextSafe(`${prefix}f3`, formData.department || "Gastroenterology");

  // 2. Leave Type dropdown
  if (formData.leave_type) {
    setDropdownSafe(`${prefix}f5`, formData.leave_type);
  }

  // 3. Australian Dates (Day, Month, Year: DD/MM/YYYY)
  const startDateAus = formatAusDate(formData.start_date);
  const endDateAus = formatAusDate(formData.end_date);
  const submissionDateAus = formatAusDate(formData.submission_date || new Date().toISOString().slice(0, 10));

  setTextSafe(`${prefix}f6`, startDateAus);
  setTextSafe(`${prefix}f7`, endDateAus);
  setTextSafe(`${prefix}f8`, formData.leave_hours || "");
  setTextSafe(`${prefix}f9`, formData.leave_balance || "");

  // 4. Costing & Allowances
  setTextSafe(`${prefix}f72`, formData.costing || "");
  setTextSafe(`${prefix}f73`, formData.allowances || "");

  // 5. Signatures & Manager
  setTextSafe(`${prefix}f74`, formData.staff_name || ""); // Employee signature line
  setTextSafe(`${prefix}f75`, submissionDateAus);
  setTextSafe(`${prefix}f80`, formData.manager_name || "Prof. Alex Thompson");

  const pdfBytes = await pdfDoc.save();

  // Trigger browser download of populated official PDF
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const staffClean = (formData.staff_name || "Staff").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = `Leave_Application_${staffClean}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  let binary = '';
  const len = pdfBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(pdfBytes[i]);
  }
  const base64 = btoa(binary);

  return { pdfBytes, base64 };
}
