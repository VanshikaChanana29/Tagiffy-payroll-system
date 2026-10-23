const Award = require('../models/Award');
const User = require('../models/User');
const OrgSettings = require('../models/OrgSettings');
const { isAdminRole } = require('../utils/roles');
const { notify } = require('../utils/notificationService');
const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../utils/emailService');
const { saveFile, deleteFile, sendStoredFile } = require('../utils/fileStorage');
const { CERTIFICATES_FOLDER, isRealImage } = require('../middleware/upload');
const {
  streamCertificatePdf,
  certificatePdfBuffer,
  certificateFileName,
  loadCertificateImages,
  CERTIFICATE_SLOTS,
  SIGNATURES_DIR,
  MONTHS,
} = require('../utils/certificatePdf');

// Usually one winner per department a month; sometimes two.
const MAX_WINNERS_PER_DEPARTMENT = 2;

const EMPLOYEE_FIELDS = 'name employeeId email department designation avatar';

const getCompanyName = async () => {
  const settings = await OrgSettings.getSettings();
  return settings.companyName || 'Taggify';
};

/**
 * Emails the winner their certificate PDF. Returns whether it went out, and
 * stamps certificateEmailedAt on success so HR can spot ones needing a resend.
 */
const emailCertificate = async (award) => {
  const employee = award.employee;
  const companyName = await getCompanyName();
  const period = `${MONTHS[award.month - 1]} ${award.year}`;

  const pdf = await certificatePdfBuffer({
    employee,
    month: award.month,
    year: award.year,
    companyName,
    images: await loadCertificateImages(),
  });

  const sent = await sendEmail({
    to: employee.email,
    subject: `Congratulations! You are Employee of the Month — ${period}`,
    text:
      `Dear ${employee.name}, congratulations on being named Employee of the Month for ${period} ` +
      `in ${award.department}. ${award.citation ? `${award.citation} ` : ''}` +
      `Your certificate of appreciation is attached. Thank you for everything you do at ${companyName}!`,
    attachments: [{ name: certificateFileName(employee, award.month, award.year), content: pdf }],
  });

  if (sent) {
    award.certificateEmailedAt = new Date();
    await award.save();
  }
  return sent;
};

// @desc    Awards for one month (defaults to the latest month that has any)
// @route   GET /api/awards?month=10&year=2026
// @access  Private (everyone — the dashboard shows the winners to all)
const getAwards = async (req, res) => {
  try {
    let month = Number(req.query.month);
    let year = Number(req.query.year);

    if (!month || !year) {
      const latest = await Award.findOne().sort({ year: -1, month: -1 });
      if (!latest) {
        return res.status(200).json({ success: true, month: null, year: null, awards: [] });
      }
      ({ month, year } = latest);
    }

    const awards = await Award.find({ month, year })
      .populate('employee', EMPLOYEE_FIELDS)
      .sort({ department: 1, createdAt: 1 });

    // Only HR needs to see delivery status and emails.
    const isAdmin = isAdminRole(req.user.role);
    const visible = awards
      .filter((a) => a.employee)
      .map((a) => {
        const award = a.toObject();
        if (!isAdmin) {
          delete award.certificateEmailedAt;
          delete award.employee.email;
        }
        return award;
      });

    res.status(200).json({ success: true, month, year, awards: visible });
  } catch (error) {
    console.error('Get Awards Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Employee of the Month awards',
      error: error.message,
    });
  }
};

// @desc    Awards the logged-in user has won
// @route   GET /api/awards/mine
// @access  Private
const getMyAwards = async (req, res) => {
  try {
    const awards = await Award.find({ employee: req.user._id }).sort({ year: -1, month: -1 });
    res.status(200).json({ success: true, awards });
  } catch (error) {
    console.error('Get My Awards Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your awards',
      error: error.message,
    });
  }
};

// @desc    Name an Employee of the Month, email their certificate and announce it
// @route   POST /api/awards
// @access  Private (Admin only)
const createAward = async (req, res) => {
  try {
    const { employeeId, citation = '' } = req.body;
    const month = Number(req.body.month);
    const year = Number(req.body.year);

    if (!employeeId || !month || !year || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: 'Please choose an employee and a month.',
      });
    }

    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
      return res.status(400).json({
        success: false,
        message: 'You can only name Employee of the Month for this month or an earlier one.',
      });
    }

    const employee = await User.findById(employeeId).select(EMPLOYEE_FIELDS + ' status');
    if (!employee || employee.status !== 'Active') {
      return res.status(404).json({ success: false, message: 'Active employee not found.' });
    }

    const period = `${MONTHS[month - 1]} ${year}`;

    if (await Award.exists({ employee: employee._id, month, year })) {
      return res.status(400).json({
        success: false,
        message: `${employee.name} is already Employee of the Month for ${period}.`,
      });
    }

    const departmentCount = await Award.countDocuments({
      department: employee.department,
      month,
      year,
    });
    if (departmentCount >= MAX_WINNERS_PER_DEPARTMENT) {
      return res.status(400).json({
        success: false,
        message: `${employee.department} already has ${MAX_WINNERS_PER_DEPARTMENT} winners for ${period}. Remove one first.`,
      });
    }

    const award = await Award.create({
      employee: employee._id,
      department: employee.department,
      month,
      year,
      citation: String(citation).trim(),
      awardedBy: req.user._id,
    });
    await award.populate('employee', EMPLOYEE_FIELDS);

    const emailed = await emailCertificate(award);

    // In-app only: the winner already gets the certificate email, and an
    // email to the whole company per winner would be noise.
    await notify({
      recipients: [employee._id],
      type: 'award_received',
      title: `You are Employee of the Month — ${period}!`,
      message: 'Congratulations! Your certificate of appreciation is on your dashboard.',
      email: false,
      relatedEntity: { kind: 'Award', id: award._id },
    });

    const everyoneElse = await User.find({ status: 'Active', _id: { $ne: employee._id } }).select('_id');
    await notify({
      recipients: everyoneElse.map((u) => u._id),
      type: 'award_announced',
      title: `Employee of the Month — ${period}`,
      message: `Congratulations to ${employee.name} (${employee.department})!`,
      email: false,
      relatedEntity: { kind: 'Award', id: award._id },
    });

    res.status(201).json({
      success: true,
      message: emailed
        ? `${employee.name} is Employee of the Month for ${period}. Certificate emailed to ${employee.email}.`
        : `${employee.name} is Employee of the Month for ${period}, but the certificate email could not be sent. Try "Resend" later.`,
      emailed,
      award,
    });
  } catch (error) {
    console.error('Create Award Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create the award',
      error: error.message,
    });
  }
};

// @desc    Email the certificate again
// @route   POST /api/awards/:id/send-certificate
// @access  Private (Admin only)
const resendCertificate = async (req, res) => {
  try {
    const award = await Award.findById(req.params.id).populate('employee', EMPLOYEE_FIELDS);
    if (!award || !award.employee) {
      return res.status(404).json({ success: false, message: 'Award not found' });
    }

    const emailed = await emailCertificate(award);
    if (!emailed) {
      return res.status(502).json({
        success: false,
        message: 'The certificate email could not be sent. Check the email settings (Brevo) and try again.',
      });
    }

    res.status(200).json({
      success: true,
      message: `Certificate emailed to ${award.employee.email}.`,
      award,
    });
  } catch (error) {
    console.error('Resend Certificate Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send the certificate',
      error: error.message,
    });
  }
};

// @desc    Remove an award (e.g. picked the wrong person)
// @route   DELETE /api/awards/:id
// @access  Private (Admin only)
const deleteAward = async (req, res) => {
  try {
    const award = await Award.findById(req.params.id).populate('employee', 'name');
    if (!award) {
      return res.status(404).json({ success: false, message: 'Award not found' });
    }

    await award.deleteOne();

    res.status(200).json({
      success: true,
      message: `Removed ${award.employee?.name || 'the'} award for ${MONTHS[award.month - 1]} ${award.year}.`,
    });
  } catch (error) {
    console.error('Delete Award Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove the award',
      error: error.message,
    });
  }
};

// @desc    Download the certificate PDF
// @route   GET /api/awards/:id/certificate
// @access  Private (the winner, or Admin)
const downloadCertificate = async (req, res) => {
  try {
    const award = await Award.findById(req.params.id).populate('employee', EMPLOYEE_FIELDS);
    if (!award || !award.employee) {
      return res.status(404).json({ success: false, message: 'Award not found' });
    }

    const isOwner = award.employee._id.toString() === req.user._id.toString();
    if (!isOwner && !isAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You can only download your own certificate.',
      });
    }

    const companyName = await getCompanyName();
    const images = await loadCertificateImages();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${certificateFileName(award.employee, award.month, award.year)}"`
    );
    streamCertificatePdf(res, {
      employee: award.employee,
      month: award.month,
      year: award.year,
      companyName,
      images,
    });
  } catch (error) {
    console.error('Download Certificate Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate the certificate',
        error: error.message,
      });
    }
  }
};

// --- Certificate signatures / stamp ----------------------------------------

const findSlot = (key) => CERTIFICATE_SLOTS.find((s) => s.key === key);

// @desc    Which signature / stamp slots have an image
// @route   GET /api/awards/certificate-images
// @access  Private (Admin only)
const getCertificateImages = async (req, res) => {
  try {
    const uploaded = (await OrgSettings.getSettings()).certificateImages || new Map();
    const slots = CERTIFICATE_SLOTS.map(({ key, label }) => ({
      key,
      label,
      // 'uploaded' = in file storage; 'local' = dev-only file on this machine.
      source: uploaded.get(key)
        ? 'uploaded'
        : fs.existsSync(path.join(SIGNATURES_DIR, `${key}.png`))
          ? 'local'
          : null,
    }));
    res.status(200).json({ success: true, slots });
  } catch (error) {
    console.error('Get Certificate Images Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load certificate signatures',
      error: error.message,
    });
  }
};

// @desc    The image in one slot (for the preview thumbnails)
// @route   GET /api/awards/certificate-images/:key
// @access  Private (Admin only)
const getCertificateImage = async (req, res) => {
  try {
    if (!findSlot(req.params.key)) {
      return res.status(404).json({ success: false, message: 'Unknown signature slot' });
    }
    const stored = (await OrgSettings.getSettings()).certificateImages?.get(req.params.key);
    if (stored && (await sendStoredFile(res, CERTIFICATES_FOLDER, stored))) return;

    const local = path.join(SIGNATURES_DIR, `${req.params.key}.png`);
    if (fs.existsSync(local)) return res.sendFile(local);

    res.status(404).json({ success: false, message: 'No image uploaded yet' });
  } catch (error) {
    console.error('Get Certificate Image Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to load image', error: error.message });
    }
  }
};

// @desc    Upload / replace the image in one slot
// @route   PUT /api/awards/certificate-images/:key
// @access  Private (Admin only)
const uploadCertificateImage = async (req, res) => {
  try {
    const slot = findSlot(req.params.key);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Unknown signature slot' });
    }
    if (!req.file || !isRealImage(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'Please choose a PNG or JPG image.' });
    }

    await saveFile(CERTIFICATES_FOLDER, req.file.filename, req.file.buffer, req.file.mimetype);

    const settings = await OrgSettings.getSettings();
    const previous = settings.certificateImages?.get(slot.key);
    settings.certificateImages.set(slot.key, req.file.filename);
    await settings.save();
    if (previous) await deleteFile(CERTIFICATES_FOLDER, previous);

    res.status(200).json({ success: true, message: `Saved: ${slot.label}.` });
  } catch (error) {
    console.error('Upload Certificate Image Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save the image',
      error: error.message,
    });
  }
};

// @desc    Remove the uploaded image from one slot
// @route   DELETE /api/awards/certificate-images/:key
// @access  Private (Admin only)
const deleteCertificateImage = async (req, res) => {
  try {
    const slot = findSlot(req.params.key);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Unknown signature slot' });
    }
    const settings = await OrgSettings.getSettings();
    const stored = settings.certificateImages?.get(slot.key);
    if (stored) {
      settings.certificateImages.delete(slot.key);
      await settings.save();
      await deleteFile(CERTIFICATES_FOLDER, stored);
    }
    res.status(200).json({ success: true, message: `Removed: ${slot.label}.` });
  } catch (error) {
    console.error('Delete Certificate Image Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove the image',
      error: error.message,
    });
  }
};

// @desc    A sample certificate with the current signatures, to check the look
// @route   GET /api/awards/certificate-preview
// @access  Private (Admin only)
const previewCertificate = async (req, res) => {
  try {
    const now = new Date();
    const companyName = await getCompanyName();
    const images = await loadCertificateImages();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Certificate_Preview.pdf"');
    streamCertificatePdf(res, {
      employee: { name: 'Employee Name', designation: 'Designation', department: 'Department' },
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      companyName,
      images,
    });
  } catch (error) {
    console.error('Preview Certificate Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to build the preview', error: error.message });
    }
  }
};

module.exports = {
  getCertificateImages,
  getCertificateImage,
  uploadCertificateImage,
  deleteCertificateImage,
  previewCertificate,
  getAwards,
  getMyAwards,
  createAward,
  resendCertificate,
  deleteAward,
  downloadCertificate,
};
