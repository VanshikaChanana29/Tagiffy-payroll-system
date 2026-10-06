const Reimbursement = require('../models/Reimbursement');
const User = require('../models/User');
const { RECEIPTS_FOLDER, isRealPdf, isRealImage } = require('../middleware/upload');
const { saveFile, deleteFile, sendStoredFile } = require('../utils/fileStorage');
const { getVisibleUserIds, canManageEmployee } = require('../utils/teamScope');
const { isAdminRole } = require('../utils/roles');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');

// Remove the file backing a receipt, ignoring a file that is already gone.
const removeStoredReceipt = (storedName) => {
  deleteFile(RECEIPTS_FOLDER, storedName);
};

// Confirms the uploaded bytes really are what the extension claims, not just a
// renamed file — same defense already used for user documents and avatars.
const isRealReceiptFile = (buffer, mimeType) =>
  mimeType === 'application/pdf' ? isRealPdf(buffer) : isRealImage(buffer);

// @desc    Submit a new reimbursement request
// @route   POST /api/reimbursements
// @access  Private (Employee / Admin for self)
const submitReimbursement = async (req, res) => {
  try {
    const userId = req.user._id;
    const { category, amount, expenseDate, description } = req.body;

    if (!category || !amount || !expenseDate || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please provide category, amount, expense date, and description',
      });
    }

    const amountNum = Number(amount);
    if (!(amountNum > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    let receipt;
    if (req.file) {
      if (!isRealReceiptFile(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'That file does not look like a valid PDF or image. Please try another file.',
        });
      }
      receipt = {
        storedName: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        uploadedAt: new Date(),
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (req.file) {
      await saveFile(RECEIPTS_FOLDER, req.file.filename, req.file.buffer, req.file.mimetype);
    }

    const newReimbursement = new Reimbursement({
      userId,
      category,
      amount: amountNum,
      expenseDate,
      description: description.trim(),
      ...(receipt && { receipt }),
      status: 'Pending',
    });

    await newReimbursement.save();

    notify({
      recipients: await getEscalationRecipientIds(user),
      type: 'reimbursement_submitted',
      title: 'New reimbursement request',
      message: `${user.name} submitted a ${category} reimbursement request for ₹${amountNum.toLocaleString('en-IN')}.`,
      relatedEntity: { kind: 'Reimbursement', id: newReimbursement._id },
    });

    res.status(201).json({
      success: true,
      message: 'Reimbursement request submitted successfully',
      reimbursement: newReimbursement,
    });
  } catch (error) {
    if (req.file) removeStoredReceipt(req.file.filename);
    console.error('Submit Reimbursement Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit reimbursement request',
      error: error.message,
    });
  }
};

// @desc    Get employee personal reimbursement history
// @route   GET /api/reimbursements/my-reimbursements
// @access  Private
const getMyReimbursements = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;

    const reimbursements = await Reimbursement.find({ userId })
      .populate('reviewedBy', 'name designation avatar')
      .sort({ createdAt: -1 });

    const stats = {
      totalApplications: reimbursements.length,
      pending: reimbursements.filter((r) => r.status === 'Pending').length,
      approved: reimbursements.filter((r) => r.status === 'Approved').length,
      rejected: reimbursements.filter((r) => r.status === 'Rejected').length,
      approvedAmount: reimbursements
        .filter((r) => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
    };

    res.status(200).json({
      success: true,
      stats,
      reimbursements,
    });
  } catch (error) {
    console.error('Get My Reimbursements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve reimbursement history',
      error: error.message,
    });
  }
};

// @desc    Get all reimbursement requests across organization (Admin/Manager)
// @route   GET /api/reimbursements/all
// @access  Private (Admin/Manager)
const getAllReimbursements = async (req, res) => {
  try {
    const { status, department, search } = req.query;

    const query = {};
    if (status && status !== 'All') {
      query.status = status;
    }

    // Managers see their own team's requests; admins see everyone's.
    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds !== null) {
      query.userId = { $in: visibleIds };
    }

    let reimbursements = await Reimbursement.find(query)
      .populate('userId', 'name email employeeId department designation avatar')
      .populate('reviewedBy', 'name designation')
      .sort({ createdAt: -1 });

    if (department && department !== 'All') {
      reimbursements = reimbursements.filter(
        (r) => r.userId && r.userId.department === department
      );
    }

    if (search) {
      const s = search.toLowerCase().trim();
      reimbursements = reimbursements.filter(
        (r) =>
          r.userId &&
          (r.userId.name.toLowerCase().includes(s) ||
            r.userId.email.toLowerCase().includes(s) ||
            r.userId.employeeId.toLowerCase().includes(s) ||
            r.description.toLowerCase().includes(s))
      );
    }

    const scopeFilter = visibleIds !== null ? { userId: { $in: visibleIds } } : {};
    const allCount = await Reimbursement.countDocuments(scopeFilter);
    const pendingCount = await Reimbursement.countDocuments({ ...scopeFilter, status: 'Pending' });
    const approvedCount = await Reimbursement.countDocuments({ ...scopeFilter, status: 'Approved' });
    const rejectedCount = await Reimbursement.countDocuments({ ...scopeFilter, status: 'Rejected' });

    res.status(200).json({
      success: true,
      count: reimbursements.length,
      stats: {
        total: allCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      reimbursements,
    });
  } catch (error) {
    console.error('Get All Reimbursements Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve reimbursement requests',
      error: error.message,
    });
  }
};

// @desc    Approve or reject a reimbursement request (Admin/Manager)
// @route   PUT /api/reimbursements/:id/status
// @access  Private (Admin/Manager)
const updateReimbursementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment = '' } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either Approved or Rejected',
      });
    }

    if (status === 'Rejected' && !adminComment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please give a reason so the employee understands the decision.',
      });
    }

    const reimbursement = await Reimbursement.findById(id);
    if (!reimbursement) {
      return res.status(404).json({ success: false, message: 'Reimbursement request not found' });
    }

    if (reimbursement.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This request was cancelled by the employee and can no longer be reviewed.',
      });
    }

    const employee = await User.findById(reimbursement.userId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (!(await canManageEmployee(req.user, reimbursement.userId))) {
      return res.status(403).json({
        success: false,
        message: 'You can only decide on reimbursements for people who report to you.',
      });
    }

    // Approving your own reimbursement is not a decision, it is a conflict of interest.
    if (reimbursement.userId.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot approve or reject your own reimbursement request.',
      });
    }

    reimbursement.status = status;
    reimbursement.adminComment = adminComment.trim();
    reimbursement.reviewedBy = req.user._id;
    reimbursement.reviewedAt = new Date();

    await reimbursement.save();

    notify({
      recipients: [employee._id],
      type: status === 'Approved' ? 'reimbursement_approved' : 'reimbursement_rejected',
      title: `Reimbursement ${status.toLowerCase()}`,
      message:
        status === 'Approved'
          ? `Your ${reimbursement.category} reimbursement of ₹${reimbursement.amount.toLocaleString('en-IN')} has been approved.`
          : `Your ${reimbursement.category} reimbursement of ₹${reimbursement.amount.toLocaleString('en-IN')} was rejected: ${adminComment.trim()}`,
      relatedEntity: { kind: 'Reimbursement', id: reimbursement._id },
    });

    res.status(200).json({
      success: true,
      message: `Reimbursement request for ${employee.name} has been ${status.toLowerCase()} successfully`,
      reimbursement,
    });
  } catch (error) {
    console.error('Update Reimbursement Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update reimbursement status',
      error: error.message,
    });
  }
};

// @desc    Employee cancels their own pending reimbursement request
// @route   PUT /api/reimbursements/:id/cancel
// @access  Private (owner only)
const cancelMyReimbursement = async (req, res) => {
  try {
    const { id } = req.params;

    const reimbursement = await Reimbursement.findById(id);
    if (!reimbursement) {
      return res.status(404).json({ success: false, message: 'Reimbursement request not found' });
    }

    if (reimbursement.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own reimbursement requests.',
      });
    }

    if (reimbursement.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only a pending request can be cancelled.',
      });
    }

    reimbursement.status = 'Cancelled';
    reimbursement.cancelledAt = new Date();
    await reimbursement.save();

    notify({
      recipients: await getEscalationRecipientIds(req.user),
      type: 'reimbursement_cancelled',
      title: 'Reimbursement request cancelled',
      message: `${req.user.name} cancelled their ${reimbursement.category} reimbursement request for ₹${reimbursement.amount.toLocaleString('en-IN')}.`,
      relatedEntity: { kind: 'Reimbursement', id: reimbursement._id },
    });

    res.status(200).json({
      success: true,
      message: 'Reimbursement request cancelled.',
      reimbursement,
    });
  } catch (error) {
    console.error('Cancel Reimbursement Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel reimbursement request',
      error: error.message,
    });
  }
};

// @desc    Download a reimbursement's receipt file
// @route   GET /api/reimbursements/:id/receipt
// @access  Private (Self or people who can manage this employee)
const downloadReimbursementReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    const reimbursement = await Reimbursement.findById(id);
    if (!reimbursement) {
      return res.status(404).json({ success: false, message: 'Reimbursement request not found' });
    }

    const isSelf = reimbursement.userId.toString() === req.user._id.toString();
    if (!isSelf && !(await canManageEmployee(req.user, reimbursement.userId))) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this receipt.',
      });
    }

    if (!reimbursement.receipt?.storedName) {
      return res.status(404).json({ success: false, message: 'No receipt was attached to this request.' });
    }

    const sent = await sendStoredFile(res, RECEIPTS_FOLDER, reimbursement.receipt.storedName, {
      contentType: reimbursement.receipt.mimeType || 'application/octet-stream',
      downloadName: reimbursement.receipt.originalName || 'receipt',
    });
    if (!sent) {
      return res.status(404).json({ success: false, message: 'The stored receipt is missing from the server.' });
    }
  } catch (error) {
    console.error('Download Reimbursement Receipt Error:', error);
    if (res.headersSent) return res.end();
    res.status(500).json({
      success: false,
      message: 'Failed to download receipt',
      error: error.message,
    });
  }
};

module.exports = {
  submitReimbursement,
  getMyReimbursements,
  getAllReimbursements,
  updateReimbursementStatus,
  cancelMyReimbursement,
  downloadReimbursementReceipt,
};
