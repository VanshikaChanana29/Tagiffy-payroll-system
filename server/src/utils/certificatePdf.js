const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const OrgSettings = require('../models/OrgSettings');
const { readFile } = require('./fileStorage');
const { CERTIFICATES_FOLDER } = require('../middleware/upload');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The directors who sign every certificate, left to right as on the printed
// certificate. `key` names their signature image slot.
const SIGNATORIES = [
  { key: 'rohit-goyal', name: 'Mr. Rohit Goyal', title: 'Director' },
  { key: 'himanshu-jindal', name: 'Mr. Himanshu Jindal', title: 'Director' },
  { key: 'sajal-jain', name: 'Mr. Sajal Jain', title: 'Director' },
  { key: 'rohit-goel', name: 'Mr. Rohit Goel', title: 'Director' },
];

const STAMP_KEY = 'company-stamp';

// Every image an admin can upload for the certificate.
const CERTIFICATE_SLOTS = [
  ...SIGNATORIES.map((s) => ({ key: s.key, label: `${s.name} (${s.title}) — signature` })),
  { key: STAMP_KEY, label: 'Company stamp / seal (optional)' },
];

// Local-dev fallback: <key>.png here is used when nothing is uploaded. Real
// signatures must not be committed (the repo is public), so production relies
// on uploads, which live in file storage (R2).
const SIGNATURES_DIR = path.resolve(__dirname, '../../assets/signatures');

/**
 * The signature / stamp images to draw, as { key: Buffer }. Uploaded images
 * win; a missing slot leaves that line blank. Never throws — a certificate
 * without signatures beats no certificate.
 */
const loadCertificateImages = async () => {
  const images = {};
  let uploaded = new Map();
  try {
    uploaded = (await OrgSettings.getSettings()).certificateImages || new Map();
  } catch (err) {
    console.error(`Could not read certificate image settings: ${err.message}`);
  }

  await Promise.all(
    CERTIFICATE_SLOTS.map(async ({ key }) => {
      try {
        const stored = uploaded.get(key);
        if (stored) {
          const buffer = await readFile(CERTIFICATES_FOLDER, stored);
          if (buffer) {
            images[key] = buffer;
            return;
          }
        }
        const local = path.join(SIGNATURES_DIR, `${key}.png`);
        if (fs.existsSync(local)) images[key] = await fs.promises.readFile(local);
      } catch (err) {
        console.error(`Certificate image ${key} could not be loaded: ${err.message}`);
      }
    })
  );
  return images;
};

const RED = '#d9412b';
const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';

// A4 landscape.
const W = 841.89;
const H = 595.28;
const CX = W / 2;

/**
 * Lays out the certificate on `doc`, following the company's printed
 * Certificate of Appreciation: red frame, black logo block over the top edge,
 * spaced-out CERTIFICATE heading and the four directors' signatures.
 */
const drawCertificate = (doc, { employee, month, year, companyName = 'Taggify', images = {} }) => {
  // --- Frame: red band, white field, thin black rule ---
  doc.rect(24, 24, W - 48, H - 48).fill(RED);
  doc.rect(50, 50, W - 100, H - 100).fill('#ffffff');
  doc.rect(62, 62, W - 124, H - 124).lineWidth(1.2).strokeColor(INK).stroke();

  // --- Logo block straddling the top of the frame ---
  const logoW = 136;
  const logoH = 70;
  doc.rect(CX - logoW / 2, 24, logoW, logoH).fill('#0a0a0b');
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
    .text(companyName.toUpperCase(), CX - logoW / 2, 48, {
      width: logoW,
      align: 'center',
      characterSpacing: 1,
    });

  // --- Heading ---
  // characterSpacing also pads after the last letter, so shift right by half
  // a gap to keep the word optically centred.
  const headingSpacing = 12;
  doc.font('Times-Roman').fontSize(44).fillColor(INK)
    .text('CERTIFICATE', 62 + headingSpacing / 2, 116, {
      width: W - 124,
      align: 'center',
      characterSpacing: headingSpacing,
    });

  doc.font('Helvetica').fontSize(10).fillColor(INK);
  const sub = 'OF APPRECIATION';
  const subSpacing = 3;
  const subWidth = doc.widthOfString(sub, { characterSpacing: subSpacing });
  const subY = 172;
  doc.text(sub, CX - subWidth / 2 + subSpacing / 2, subY, { lineBreak: false, characterSpacing: subSpacing });
  doc.moveTo(CX - subWidth / 2 - 70, subY + 5).lineTo(CX - subWidth / 2 - 12, subY + 5)
    .moveTo(CX + subWidth / 2 + 12, subY + 5).lineTo(CX + subWidth / 2 + 70, subY + 5)
    .lineWidth(1).strokeColor(INK).stroke();

  // --- Recipient ---
  doc.font('Helvetica').fontSize(11).fillColor(MUTED)
    .text('This certificate is proudly presented to', 62, 208, { width: W - 124, align: 'center' });

  // Shrink long names until they fit on one line.
  let nameSize = 34;
  doc.font('Times-BoldItalic');
  while (nameSize > 18 && doc.fontSize(nameSize).widthOfString(employee.name) > 560) nameSize -= 2;
  doc.fontSize(nameSize).fillColor(INK)
    .text(employee.name, 62, 228 + (34 - nameSize) / 2, { width: W - 124, align: 'center' });
  doc.moveTo(CX - 170, 274).lineTo(CX + 170, 274).lineWidth(0.8).strokeColor('#cbd5e1').stroke();

  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(RED)
    .text(`EMPLOYEE OF THE MONTH  ·  ${MONTHS[month - 1].toUpperCase()} ${year}`, 62, 286, {
      width: W - 124,
      align: 'center',
      characterSpacing: 1.5,
    });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text([employee.designation, employee.department].filter(Boolean).join('  ·  '), 62, 304, {
      width: W - 124,
      align: 'center',
    });

  // --- Body, worded as on the printed certificate ---
  doc.font('Helvetica').fontSize(10.5).fillColor(BODY)
    .text(
      'In recognition of exceptional performance, dedication, and outstanding contributions ' +
        `that exemplify excellence at ${companyName}. We appreciate your hard work and wish you ` +
        'continued success and growth in all your future endeavors.',
      CX - 235, 334,
      { width: 470, align: 'center', lineGap: 3 }
    );

  // --- Company stamp, in the empty space right of the award line ---
  if (images[STAMP_KEY]) {
    try {
      doc.image(images[STAMP_KEY], W - 62 - 118, 268, { fit: [100, 100], align: 'center', valign: 'center' });
    } catch (err) {
      console.error(`Certificate stamp could not be drawn: ${err.message}`);
    }
  }

  // --- Signatures ---
  const left = 84;
  const colW = (W - left * 2) / SIGNATORIES.length;
  const lineY = 462;
  SIGNATORIES.forEach((s, i) => {
    const colX = left + i * colW;
    if (images[s.key]) {
      try {
        doc.image(images[s.key], colX + (colW - 120) / 2, lineY - 46, {
          fit: [120, 42],
          align: 'center',
          valign: 'bottom',
        });
      } catch (err) {
        console.error(`Certificate signature ${s.key} could not be drawn: ${err.message}`);
      }
    }
    doc.moveTo(colX + (colW - 130) / 2, lineY).lineTo(colX + (colW + 130) / 2, lineY)
      .lineWidth(0.8).strokeColor(INK).stroke();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
      .text(s.name, colX, lineY + 7, { width: colW, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`(${s.title})`, colX, lineY + 20, { width: colW, align: 'center' });
  });
};

const newDocument = () =>
  new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });

/** Streams the certificate PDF to an HTTP response. */
const streamCertificatePdf = (res, data) => {
  const doc = newDocument();
  doc.pipe(res);
  drawCertificate(doc, data);
  doc.end();
};

/** Renders the certificate PDF into a Buffer, e.g. for an email attachment. */
const certificatePdfBuffer = (data) =>
  new Promise((resolve, reject) => {
    const doc = newDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawCertificate(doc, data);
    doc.end();
  });

const certificateFileName = (employee, month, year) =>
  `Employee_of_the_Month_${String(employee.name).replace(/\s+/g, '_')}_${year}-${String(month).padStart(2, '0')}.pdf`;

module.exports = {
  streamCertificatePdf,
  certificatePdfBuffer,
  certificateFileName,
  loadCertificateImages,
  CERTIFICATE_SLOTS,
  SIGNATURES_DIR,
  MONTHS,
};
