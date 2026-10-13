import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// Clean table borders
const standardBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

/**
 * Generate and download formatted Word (.docx) Bulletin
 * matching St Vincent's Gastro Bulletin layout.
 */
export async function exportBulletinDocx(data) {
  const {
    bulletinNumber = '146',
    weekTitle = 'week beginning 12th October 2026',
    contacts = 'Please contact Anne or Aathira if you would like to \ninclude something in the Bulletin',
    meetings = [],
    wardTeam = []
  } = data;

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,    // 0.5 in
            bottom: 720,
            left: 720,
            right: 720,
          }
        }
      },
      children: [
        // Title: Department of Gastroenterology
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Department of Gastroenterology",
              bold: true,
              size: 28, // 14pt
              font: "Calibri",
            }),
          ],
        }),
        // Weekly Bulletin 2026
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `Weekly Bulletin ${new Date().getFullYear()}`,
              bold: true,
              size: 28,
              font: "Calibri",
            }),
          ],
        }),
        // Contact Notice (Cyan/Blue text)
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: contacts,
              color: "00B0F0",
              size: 24, // 12pt
              font: "Calibri",
            }),
          ],
        }),
        // Bulletin Header (Red text)
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: `BULLETIN ${bulletinNumber} – ${weekTitle}`,
              bold: true,
              color: "FF0000",
              size: 28,
              font: "Calibri",
            }),
          ],
        }),

        // Meetings Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header Row
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: 4,
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: "MEETINGS", bold: true, size: 22, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            // Meeting Rows
            ...meetings.map(m => new TableRow({
              children: [
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: m.day || "", bold: true, size: 20, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 18, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: m.time || "", size: 20, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: m.name || "", bold: true, size: 20, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 32, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: m.location || "", size: 20, font: "Calibri" }),
                        m.details ? new TextRun({ text: `\n${m.details}`, size: 20, font: "Calibri" }) : new TextRun(""),
                      ],
                    }),
                  ],
                }),
              ],
            })),
          ],
        }),

        new Paragraph({ spacing: { before: 240, after: 120 } }),

        // Current Ward Team Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header Row
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: 2,
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `CURRENT WARD TEAM FOR ${weekTitle.toUpperCase()} (INPATIENT AND CONSULTS)`,
                          bold: true,
                          size: 22,
                          font: "Calibri"
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            // Ward Rows
            ...wardTeam.map(w => new TableRow({
              children: [
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: w.role || "", bold: true, size: 20, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 75, type: WidthType.PERCENTAGE },
                  borders: standardBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: w.staff || "", size: 20, font: "Calibri" }),
                      ],
                    }),
                  ],
                }),
              ],
            })),
          ],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `Bulletin_${bulletinNumber}_${weekTitle.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
  saveAs(blob, filename);
}
