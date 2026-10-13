import { jsPDF } from "jspdf";

export function generateLeavePdf(formData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Header banner
  doc.setFillColor(30, 58, 138); // SVHA navy
  doc.rect(0, 0, 210, 24, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("ST VINCENT'S HOSPITAL MELBOURNE", 14, 12);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Gastroenterology & Clinical Nutrition — Application for Leave", 14, 18);

  // Reset text
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);

  let y = 36;
  const lineGap = 8;

  function field(label, val) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(val || "N/A"), 70, y);
    y += lineGap;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. Employee Information", 14, y);
  y += lineGap;

  field("Staff Name", formData.staff_name);
  field("Employee Number", formData.employee_number);
  field("Department", formData.department || "Gastroenterology");
  field("Manager / Approver", formData.manager_name || "Prof. Alex Thompson");

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. Leave Details", 14, y);
  y += lineGap;

  field("Leave Type", formData.leave_type);
  field("Start Date", formData.start_date);
  field("End Date", formData.end_date);
  field("Total Hours", formData.leave_hours || "Standard shift");
  field("Pay in Advance", formData.pay_in_advance || "No");
  field("Costing / Cost Centre", formData.costing || "Default Dept");
  field("Allowances", formData.allowances || "None");

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. Declaration & Submission", 14, y);
  y += lineGap;

  field("Submission Date", formData.submission_date || new Date().toISOString().slice(0, 10));
  field("Application Status", (formData.status || "Submitted").toUpperCase());

  y += 12;
  // Signoff boxes
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, 85, 25);
  doc.rect(110, y, 85, 25);

  doc.setFontSize(9);
  doc.text("Applicant Signature (Digital Record)", 16, y + 6);
  doc.text(`Signed: ${formData.staff_name}`, 16, y + 16);

  doc.text("Department Head Approval", 112, y + 6);
  doc.text(`Approved by: ${formData.manager_name || 'Prof. Alex Thompson'}`, 112, y + 16);

  // Footer notes
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Submit this signed/verified PDF to Hospital Payroll / Department Admin.", 14, 280);

  // Trigger browser download
  const filename = `Leave_${(formData.staff_name || "Staff").replace(/\s+/g, "_")}_${formData.start_date || "date"}.pdf`;
  doc.save(filename);
}
