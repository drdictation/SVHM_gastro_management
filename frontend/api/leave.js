import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};
    const staffName = data.staff_name || 'Staff Member';
    const empNo = data.employee_number || '-';
    const leaveType = data.leave_type || 'Annual Leave';
    const startDate = data.start_date || '';
    const endDate = data.end_date || '';
    const hours = data.leave_hours || '38';
    const manager = data.manager_name || 'Prof. Alex Thompson';
    const applicantEmail = (data.applicant_email || '').trim();

    const gmailUser = process.env.GMAIL_USER || 'gastroenterologystvincents@gmail.com';
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim();

    const coordinatorEmail = process.env.COORDINATOR_EMAIL || 'anne.savage@svha.org.au';
    const endoEmail = process.env.ENDOSCOPY_WAITINGLIST_EMAIL || 'Endoscopy Waitinglist - SVHM <Endoscopy.Waitinglist@svhm.org.au>';
    const clinicEmail = process.env.CLINIC_COORDINATION_EMAIL || 'gastroenterology.caseco-ordinationteam <gastroenterology.cas@svha.org.au>';

    const isTestMode = Boolean(data.test_mode || data.test_only || process.env.TEST_EMAIL_ONLY === 'true');

    const endoClashes = data.endo_clashes || [];
    const clinicClashes = data.clinic_clashes || [];

    let toEmails = [];
    let ccEmails = [];

    if (isTestMode) {
      toEmails = [gmailUser];
      ccEmails = [];
    } else {
      if (applicantEmail) toEmails.push(applicantEmail);
      toEmails.push(coordinatorEmail);
      if (endoClashes.length > 0) ccEmails.push(endoEmail);
      if (clinicClashes.length > 0) ccEmails.push(clinicEmail);
    }

    if (!gmailPass) {
      return res.status(200).json({
        success: true,
        id: Date.now(),
        email_dispatched: false,
        email_simulated: true,
        email_recipients: toEmails.concat(ccEmails),
        email_message: 'GMAIL_APP_PASSWORD environment variable not set in Vercel. Email was simulated.',
        endo_clashes_count: endoClashes.length,
        clinic_clashes_count: clinicClashes.length
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });

    const subjectPrefix = isTestMode ? '[TEST MODE - GMAIL ONLY] ' : '';
    const subject = `${subjectPrefix}Leave Application: ${staffName} (${startDate} to ${endDate})`;

    const endoRows = endoClashes.map(c => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;font-weight:600;">${c.date || ''} (${c.session || ''})</td>
        <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;">${c.room || c.room_name || ''} (${c.listType || c.list_type || ''})</td>
        <td style="padding:6px 10px;border-bottom:1px solid #fee2e2;color:#991b1b;font-weight:500;">${c.coverDoctor || c.covering_staff_name || 'Needs Cover / Vacant'}</td>
      </tr>
    `).join('');

    const clinicRows = clinicClashes.map(cl => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;font-weight:600;">${cl.date || ''} (${cl.day_of_week || ''})</td>
        <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;">${cl.clinic_name || ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #fef3c7;color:#92400e;font-weight:500;">${cl.covering_staff_name || 'Needs Cover / Vacant'}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;">
        <div style="background:#1e3a8a;color:#fff;padding:20px 24px;">
          <h2 style="margin:0;font-size:18px;">St Vincent's Hospital Melbourne</h2>
          <p style="margin:4px 0 0;font-size:12px;color:#93c5fd;">Department of Gastroenterology &bull; Official Leave Application</p>
        </div>
        <div style="padding:24px;">
          ${isTestMode ? `
            <div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:12px;border-radius:6px;font-size:12px;margin-bottom:16px;">
              <strong>🧪 TEST EMAIL NOTICE:</strong> Sent strictly to <code>${gmailUser}</code> for verification. Coordinator and clinical waiting list notifications were suppressed.
            </div>
          ` : ''}
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">
            <tr><td style="padding:6px 0;color:#64748b;width:35%;">Staff Member:</td><td style="padding:6px 0;font-weight:600;">${staffName}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Employee Number:</td><td style="padding:6px 0;">${empNo}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Leave Type:</td><td style="padding:6px 0;">${leaveType}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Dates:</td><td style="padding:6px 0;font-weight:600;">${startDate} &rarr; ${endDate}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Hours / Days:</td><td style="padding:6px 0;">${hours}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Approving Manager:</td><td style="padding:6px 0;">${manager}</td></tr>
          </table>

          ${endoClashes.length > 0 ? `
            <div style="background:#fff1f2;border:1px solid #fecdd3;padding:12px;border-radius:6px;margin-bottom:14px;font-size:12px;">
              <strong style="color:#9f1239;">&bull; Endoscopy Waiting List Clashes (${endoClashes.length})</strong>
              <table style="width:100%;margin-top:6px;font-size:11.5px;border-collapse:collapse;">
                <tr style="background:#ffe4e6;color:#881337;">
                  <th style="padding:4px 8px;text-align:left;">Date & Session</th>
                  <th style="padding:4px 8px;text-align:left;">Room & List</th>
                  <th style="padding:4px 8px;text-align:left;">Cover</th>
                </tr>
                ${endoRows}
              </table>
            </div>
          ` : ''}

          ${clinicClashes.length > 0 ? `
            <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:6px;margin-bottom:14px;font-size:12px;">
              <strong style="color:#92400e;">&bull; Outpatient Clinic Clashes (${clinicClashes.length})</strong>
              <table style="width:100%;margin-top:6px;font-size:11.5px;border-collapse:collapse;">
                <tr style="background:#fef3c7;color:#78350f;">
                  <th style="padding:4px 8px;text-align:left;">Date</th>
                  <th style="padding:4px 8px;text-align:left;">Clinic</th>
                  <th style="padding:4px 8px;text-align:left;">Cover</th>
                </tr>
                ${clinicRows}
              </table>
            </div>
          ` : ''}

          <p style="font-size:12px;color:#475569;margin-top:14px;">
            &bull; The official populated St Vincent's Hospital Melbourne Leave Application PDF is attached to this email.
          </p>
        </div>
      </div>
    `;

    const attachments = [];
    if (data.pdf_base64) {
      attachments.push({
        filename: `Leave_Application_${staffName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
        content: Buffer.from(data.pdf_base64, 'base64'),
        contentType: 'application/pdf'
      });
    }

    const info = await transporter.sendMail({
      from: `"Gastroenterology St Vincent's" <${gmailUser}>`,
      to: toEmails.join(', '),
      cc: ccEmails.length > 0 ? ccEmails.join(', ') : undefined,
      subject,
      html: htmlContent,
      attachments
    });

    const allSentRecipients = toEmails.concat(ccEmails);

    return res.status(200).json({
      success: true,
      id: Date.now(),
      email_dispatched: true,
      email_simulated: false,
      email_recipients: allSentRecipients,
      email_message: `Email successfully sent to ${allSentRecipients.join(', ')} (Message ID: ${info.messageId})`,
      messageId: info.messageId,
      endo_clashes_count: endoClashes.length,
      clinic_clashes_count: clinicClashes.length
    });
  } catch (err) {
    console.error('Error in /api/leave handler:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      email_message: `Failed to dispatch email: ${err.message}`
    });
  }
}
