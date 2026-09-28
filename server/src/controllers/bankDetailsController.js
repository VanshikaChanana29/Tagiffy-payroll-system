const mongoose = require('mongoose');
const User = require('../models/User');
const { isAdminRole, isSuperAdmin } = require('../utils/roles');
const { notify, getHrAndOwnerIds } = require('../utils/notificationService');

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// "XXXXXX7801" — enough for someone to recognise their account in messages.
const maskAccount = (acc) => (acc ? `${'X'.repeat(Math.max(0, acc.length - 4))}${acc.slice(-4)}` : '');

/**
 * Validates bank details typed by an employee or HR. Account numbers may be
 * typed with spaces; they are stored as digits only. Returns { value } or { error }.
 */
const parseBankDetails = ({ accountNumber, confirmAccountNumber, ifscCode, bankName }) => {
  const acc = String(accountNumber || '').replace(/[\s-]/g, '');
  const confirm = String(confirmAccountNumber || '').replace(/[\s-]/g, '');
  const ifsc = String(ifscCode || '').trim().toUpperCase();
  const bank = String(bankName || '').trim();

  if (!acc || !ifsc || !bank) {
    return { error: 'Account number, IFSC code and bank name are all required.' };
  }
  if (!/^\d{9,18}$/.test(acc)) {
    return { error: 'Account number must be 9 to 18 digits.' };
  }
  if (acc !== confirm) {
    return { error: 'The two account numbers do not match. Please re-enter them.' };
  }
  if (!IFSC.test(ifsc)) {
    return { error: 'IFSC code must be 11 characters, like HDFC0001234 (5th character is 0).' };
  }
  return { value: { accountNumber: acc, ifscCode: ifsc, bankName: bank } };
};

const hasDetails = (bd) => !!(bd?.accountNumber && bd?.ifscCode && bd?.bankName);

const clearedPending = () => ({
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  reason: '',
  requestedAt: null,
  previousStatus: 'Unconfirmed',
});

// Loads the employee after checking who may act: 'self', 'admin', or 'either'.
const loadEmployee = async (req, res, who) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid employee id' });
    return null;
  }
  const isSelf = req.user._id.toString() === id;
  const isAdmin = isAdminRole(req.user.role);
  const allowed = who === 'self' ? isSelf : who === 'admin' ? isAdmin : isSelf || isAdmin;
  if (!allowed) {
    res.status(403).json({
      success: false,
      message:
        who === 'self'
          ? 'Only the employee can do this for their own bank details.'
          : 'You are not allowed to view or change these bank details.',
    });
    return null;
  }
  const employee = await User.findById(id);
  if (!employee) {
    res.status(404).json({ success: false, message: 'Employee not found' });
    return null;
  }
  return employee;
};

const respond = (res, employee, message, status = 200) =>
  res.status(status).json({ success: true, message, bankDetails: employee.bankDetails });

// @desc    View bank details
// @route   GET /api/users/:id/bank-details
// @access  Private (Self or HR)
const getBankDetails = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'either');
    if (!employee) return;
    res.status(200).json({ success: true, bankDetails: employee.bankDetails });
  } catch (error) {
    console.error('Get Bank Details Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load bank details', error: error.message });
  }
};

// @desc    Employee confirms the bank details on record are correct
// @route   PUT /api/users/:id/bank-details/confirm
// @access  Private (Self)
const confirmBankDetails = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'self');
    if (!employee) return;
    const bd = employee.bankDetails;

    if (!hasDetails(bd)) {
      return res.status(400).json({
        success: false,
        message: 'No bank details on record yet. Please add them using "Add bank details".',
      });
    }
    if (bd.status === 'Correction Pending') {
      return res.status(400).json({
        success: false,
        message: 'Your correction request is waiting for HR. Cancel it first to confirm the current details.',
      });
    }

    bd.status = 'Confirmed';
    bd.confirmedAt = new Date();
    await employee.save();
    respond(res, employee, 'Thanks! Your bank details are confirmed.');
  } catch (error) {
    console.error('Confirm Bank Details Error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm bank details', error: error.message });
  }
};

// @desc    Employee asks HR to correct (or add) their bank details
// @route   POST /api/users/:id/bank-details/correction
// @access  Private (Self)
const requestBankCorrection = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'self');
    if (!employee) return;
    const bd = employee.bankDetails;

    if (bd.status === 'Correction Pending') {
      return res.status(400).json({
        success: false,
        message: 'You already have a correction request waiting for HR. Cancel it to send a new one.',
      });
    }

    const { value, error } = parseBankDetails(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    if (
      value.accountNumber === bd.accountNumber &&
      value.ifscCode === bd.ifscCode &&
      value.bankName.toLowerCase() === (bd.bankName || '').toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: 'These are the same as your current details. Use "Details are correct" instead.',
      });
    }

    bd.pendingChange = {
      ...value,
      reason: String(req.body.reason || '').trim(),
      requestedAt: new Date(),
      previousStatus: bd.status || 'Unconfirmed',
    };
    bd.status = 'Correction Pending';
    await employee.save();

    const isAddition = !hasDetails(bd);
    notify({
      recipients: (await getHrAndOwnerIds()).filter((uid) => uid.toString() !== employee._id.toString()),
      type: 'bank_details_correction_requested',
      title: isAddition ? 'Bank details submitted' : 'Bank details correction request',
      message: `${employee.name} (${employee.employeeId}) ${
        isAddition ? 'submitted their bank details' : 'asked to change their bank details'
      } to ${value.bankName}, account ${maskAccount(value.accountNumber)}. Please review before the next payroll.`,
      relatedEntity: { kind: 'User', id: employee._id },
    });

    respond(res, employee, 'Request sent to HR. Your salary account changes once HR approves it.', 201);
  } catch (error) {
    console.error('Bank Correction Request Error:', error);
    res.status(500).json({ success: false, message: 'Failed to send correction request', error: error.message });
  }
};

// @desc    Employee withdraws their pending correction request
// @route   DELETE /api/users/:id/bank-details/correction
// @access  Private (Self)
const cancelBankCorrection = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'self');
    if (!employee) return;
    const bd = employee.bankDetails;

    if (bd.status !== 'Correction Pending') {
      return res.status(400).json({ success: false, message: 'There is no pending request to cancel.' });
    }
    bd.status = bd.pendingChange?.previousStatus || 'Unconfirmed';
    bd.pendingChange = clearedPending();
    await employee.save();
    respond(res, employee, 'Correction request cancelled.');
  } catch (error) {
    console.error('Cancel Bank Correction Error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel request', error: error.message });
  }
};

// @desc    HR approves or rejects an employee's correction request
// @route   PUT /api/users/:id/bank-details/correction
// @access  Private (HR)
const reviewBankCorrection = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'admin');
    if (!employee) return;
    const bd = employee.bankDetails;
    const { action, comment = '' } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject.' });
    }
    if (bd.status !== 'Correction Pending') {
      return res.status(400).json({ success: false, message: 'There is no pending request for this employee.' });
    }
    // Changing the account your own salary goes to needs a second person.
    if (employee._id.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot approve or reject a change to your own bank details.',
      });
    }
    if (action === 'reject' && !String(comment).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please give a reason so the employee knows what to fix.',
      });
    }

    const pending = bd.pendingChange;
    if (action === 'approve') {
      bd.accountNumber = pending.accountNumber;
      bd.ifscCode = pending.ifscCode;
      bd.bankName = pending.bankName;
      // The employee typed these themselves and HR checked them.
      bd.status = 'Confirmed';
      bd.confirmedAt = new Date();
      bd.reviewNote = String(comment).trim();
    } else {
      bd.status = pending.previousStatus || 'Unconfirmed';
      bd.reviewNote = String(comment).trim();
    }
    bd.reviewedBy = req.user._id;
    bd.reviewedAt = new Date();
    bd.pendingChange = clearedPending();
    await employee.save();

    notify({
      recipients: [employee._id],
      type: action === 'approve' ? 'bank_details_correction_approved' : 'bank_details_correction_rejected',
      title: action === 'approve' ? 'Bank details updated' : 'Bank details change rejected',
      message:
        action === 'approve'
          ? `HR approved your bank details: ${bd.bankName}, account ${maskAccount(bd.accountNumber)}. Salary will be paid to this account.`
          : `HR could not approve your bank details change: ${bd.reviewNote}`,
      relatedEntity: { kind: 'User', id: employee._id },
    });

    respond(res, employee, action === 'approve' ? 'Bank details updated.' : 'Request rejected.');
  } catch (error) {
    console.error('Review Bank Correction Error:', error);
    res.status(500).json({ success: false, message: 'Failed to review request', error: error.message });
  }
};

// @desc    HR sets or corrects an employee's bank details directly
// @route   PUT /api/users/:id/bank-details
// @access  Private (HR)
const updateBankDetailsByHr = async (req, res) => {
  try {
    const employee = await loadEmployee(req, res, 'admin');
    if (!employee) return;
    const isSelf = employee._id.toString() === req.user._id.toString();

    if (isAdminRole(employee.role) && !isSelf && !isSuperAdmin(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can manage another admin account.',
      });
    }

    const { value, error } = parseBankDetails(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const bd = employee.bankDetails;
    const changed =
      value.accountNumber !== bd.accountNumber ||
      value.ifscCode !== bd.ifscCode ||
      value.bankName !== bd.bankName;

    Object.assign(bd, value);
    if (changed) {
      // New details the employee hasn't seen yet: they confirm them again.
      // Any request they had pending is superseded by HR's edit.
      bd.status = 'Unconfirmed';
      bd.confirmedAt = null;
      bd.pendingChange = clearedPending();
      bd.reviewNote = '';
    }
    await employee.save();

    if (changed && !isSelf) {
      notify({
        recipients: [employee._id],
        type: 'bank_details_updated_by_hr',
        title: 'Please confirm your bank details',
        message: `HR updated your bank details to ${bd.bankName}, account ${maskAccount(bd.accountNumber)}. Please check them on your profile and confirm.`,
        relatedEntity: { kind: 'User', id: employee._id },
      });
    }

    respond(res, employee, changed ? 'Bank details saved. The employee has been asked to confirm them.' : 'No changes.');
  } catch (error) {
    console.error('Update Bank Details Error:', error);
    res.status(500).json({ success: false, message: 'Failed to save bank details', error: error.message });
  }
};

module.exports = {
  getBankDetails,
  confirmBankDetails,
  requestBankCorrection,
  cancelBankCorrection,
  reviewBankCorrection,
  updateBankDetailsByHr,
  parseBankDetails,
};
