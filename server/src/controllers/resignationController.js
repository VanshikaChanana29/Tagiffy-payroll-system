const mongoose = require('mongoose');
const { format } = require('date-fns');
const Resignation = require('../models/Resignation');
const EmployeeExit = require('../models/EmployeeExit');
const { exitStatus } = require('../models/EmployeeExit');
const User = require('../models/User');
const { isAdminRole, isSuperAdmin } = require('../utils/roles');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');
const { processDueExits } = require('../utils/exitScheduler');
const { parseDateOnly } = require('./exitController');

const fmt = (d) => format(new Date(d), 'dd MMM yyyy');

const EMPLOYEE_FIELDS = 'name employeeId email department designation joiningDate avatar role status reportingManager';

const populateResignation = (query) =>
  query
    .populate({ path: 'userId', select: EMPLOYEE_FIELDS, populate: { path: 'reportingManager', select: 'name designation' } })
    .populate('decidedBy', 'name')
    .populate('exit', 'lastWorkingDay withdrawnAt deactivatedAt originalLastWorkingDay earlyReliefReason relievedEarlyAt');

// Once accepted, the exit record is the truth (it can be edited or withdrawn
// from the exit register), so surface its current state too.
const withExitStatus = (r) => {
  const obj = r.toObject();
  if (r.exit && r.exit.lastWorkingDay) {
    obj.exitStatus = exitStatus(r.exit);
    obj.lastWorkingDay = r.exit.lastWorkingDay;
    obj.originalLastWorkingDay = r.exit.originalLastWorkingDay;
    obj.earlyReliefReason = r.exit.earlyReliefReason;
  }
  return obj;
};

/**
 * Who may accept / reject this employee's resignation: HR for anyone except
 * admins (a super admin's call), or the employee's own reporting manager.
 */
const canDecide = (actor, employee) => {
  if (employee._id.toString() === actor._id.toString()) {
    return 'You cannot decide on your own resignation.';
  }
  if (isAdminRole(actor.role)) {
    if (isAdminRole(employee.role) && !isSuperAdmin(actor.role)) {
      return 'Only a super admin can decide on an admin\'s resignation.';
    }
    return null;
  }
  if (employee.reportingManager && employee.reportingManager.toString() === actor._id.toString()) {
    return null;
  }
  return 'Only HR or this employee\'s reporting manager can decide on this resignation.';
};

/** HR + the employee's manager, minus whoever is acting. */
const recipientsFor = async (employee, excludeId) =>
  (await getEscalationRecipientIds(employee)).filter((id) => id.toString() !== excludeId.toString());

// @desc    Submit my resignation
// @route   POST /api/resignations
// @access  Private
const submitResignation = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Only an active employee can submit a resignation.' });
    }

    const resignationDate = parseDateOnly(req.body.resignationDate);
    if (!resignationDate) {
      return res.status(400).json({ success: false, message: 'Please enter a valid resignation date.' });
    }
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ success: false, message: 'Please tell us the reason for resigning.' });
    }

    const pending = await Resignation.exists({ userId: user._id, status: 'Pending' });
    if (pending) {
      return res.status(400).json({
        success: false,
        message: 'You already have a resignation waiting for approval. Withdraw it first to submit a new one.',
      });
    }
    const openExit = await EmployeeExit.exists({ employee: user._id, withdrawnAt: null, deactivatedAt: null });
    if (openExit) {
      return res.status(400).json({ success: false, message: 'Your exit is already recorded and you are serving notice.' });
    }

    const resignation = await Resignation.create({
      userId: user._id,
      resignationDate,
      reason: reason.slice(0, 1000),
    });

    notify({
      recipients: await recipientsFor(user, user._id),
      type: 'resignation_submitted',
      title: `Resignation submitted: ${user.name}`,
      message: `${user.name} (${user.employeeId}, ${user.designation || user.department || 'Employee'}) has submitted a resignation dated ${fmt(resignationDate)}.`,
      emailDetails: `Reason: ${reason}\n\nPlease review it on the Taggify portal and set the last working day.`,
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });

    const saved = await populateResignation(Resignation.findById(resignation._id));
    res.status(201).json({
      success: true,
      message: 'Resignation submitted. HR and your manager have been notified.',
      resignation: withExitStatus(saved),
    });
  } catch (error) {
    console.error('Submit Resignation Error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit the resignation', error: error.message });
  }
};

// @desc    My resignations, newest first
// @route   GET /api/resignations/mine
// @access  Private
const getMyResignations = async (req, res) => {
  try {
    const list = await populateResignation(Resignation.find({ userId: req.user._id }).sort({ createdAt: -1 }));
    res.status(200).json({ success: true, resignations: list.map(withExitStatus) });
  } catch (error) {
    console.error('Get My Resignations Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load your resignations', error: error.message });
  }
};

// @desc    Take back my pending resignation
// @route   POST /api/resignations/:id/withdraw
// @access  Private (owner)
const withdrawResignation = async (req, res) => {
  try {
    const resignation = await Resignation.findById(req.params.id);
    if (!resignation || resignation.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Resignation not found' });
    }
    if (resignation.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message:
          resignation.status === 'Accepted'
            ? 'This resignation is already accepted. Please speak to HR to take it back.'
            : `This resignation is already ${resignation.status.toLowerCase()}.`,
      });
    }

    resignation.status = 'Withdrawn';
    resignation.decidedAt = new Date();
    await resignation.save();

    const user = await User.findById(req.user._id);
    notify({
      recipients: await recipientsFor(user, user._id),
      type: 'resignation_withdrawn',
      title: `Resignation withdrawn: ${user.name}`,
      message: `${user.name} has withdrawn their resignation dated ${fmt(resignation.resignationDate)}.`,
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });

    const saved = await populateResignation(Resignation.findById(resignation._id));
    res.status(200).json({ success: true, message: 'Resignation withdrawn.', resignation: withExitStatus(saved) });
  } catch (error) {
    console.error('Withdraw Resignation Error:', error);
    res.status(500).json({ success: false, message: 'Failed to withdraw the resignation', error: error.message });
  }
};

// @desc    Resignations to review: HR sees everyone, a manager their reports
// @route   GET /api/resignations?status=
// @access  Private (Admin, Manager)
const getResignations = async (req, res) => {
  try {
    const query = {};
    if (req.query.status && Resignation.RESIGNATION_STATUSES.includes(req.query.status)) {
      query.status = req.query.status;
    }
    if (!isAdminRole(req.user.role)) {
      const reports = await User.find({ reportingManager: req.user._id }).select('_id');
      query.userId = { $in: reports.map((r) => r._id) };
    }
    const list = await populateResignation(Resignation.find(query).sort({ createdAt: -1 }));
    res.status(200).json({ success: true, resignations: list.map(withExitStatus) });
  } catch (error) {
    console.error('Get Resignations Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load resignations', error: error.message });
  }
};

/** Loads a pending resignation the actor is allowed to decide on. */
const loadForDecision = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ success: false, message: 'Resignation not found' });
    return null;
  }
  const resignation = await Resignation.findById(req.params.id);
  if (!resignation) {
    res.status(404).json({ success: false, message: 'Resignation not found' });
    return null;
  }
  const employee = await User.findById(resignation.userId);
  if (!employee) {
    res.status(404).json({ success: false, message: 'Employee not found' });
    return null;
  }
  const denied = canDecide(req.user, employee);
  if (denied) {
    res.status(403).json({ success: false, message: denied });
    return null;
  }
  if (resignation.status !== 'Pending') {
    res.status(400).json({ success: false, message: `This resignation is already ${resignation.status.toLowerCase()}.` });
    return null;
  }
  return { resignation, employee };
};

// @desc    Accept a resignation and set the last working day
// @route   POST /api/resignations/:id/accept
// @access  Private (Admin, reporting Manager)
const acceptResignation = async (req, res) => {
  try {
    const loaded = await loadForDecision(req, res);
    if (!loaded) return;
    const { resignation, employee } = loaded;

    const lastWorkingDay = parseDateOnly(req.body.lastWorkingDay);
    if (!lastWorkingDay) {
      return res.status(400).json({ success: false, message: 'Please enter a valid last working day.' });
    }
    if (lastWorkingDay < resignation.resignationDate) {
      return res.status(400).json({ success: false, message: 'The last working day cannot be before the resignation date.' });
    }
    if (employee.status !== 'Active') {
      return res.status(400).json({ success: false, message: `${employee.name} is already inactive.` });
    }
    const openExit = await EmployeeExit.exists({ employee: employee._id, withdrawnAt: null, deactivatedAt: null });
    if (openExit) {
      return res.status(400).json({ success: false, message: `${employee.name} already has an exit recorded in the exit register.` });
    }
    const note = String(req.body.note || '').trim().slice(0, 1000);

    const exit = await EmployeeExit.create({
      employee: employee._id,
      snapshot: {
        name: employee.name,
        employeeId: employee.employeeId,
        email: employee.email,
        department: employee.department,
        designation: employee.designation,
        joiningDate: employee.joiningDate,
      },
      exitType: 'Resigned',
      noticeDate: resignation.resignationDate,
      lastWorkingDay,
      reason: resignation.reason,
      recordedBy: req.user._id,
    });

    resignation.status = 'Accepted';
    resignation.decidedBy = req.user._id;
    resignation.decidedAt = new Date();
    resignation.decisionNote = note;
    resignation.lastWorkingDay = lastWorkingDay;
    resignation.exit = exit._id;
    await resignation.save();

    // A last working day already in the past deactivates right away.
    await processDueExits();

    notify({
      recipients: [employee._id],
      type: 'resignation_accepted',
      title: 'Your resignation has been accepted',
      message: `${req.user.name} accepted your resignation. Your last working day is ${fmt(lastWorkingDay)}.`,
      emailDetails: note ? `Note: ${note}` : '',
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });
    notify({
      recipients: await recipientsFor(employee, req.user._id),
      type: 'resignation_accepted',
      title: `Resignation accepted: ${employee.name}`,
      message: `${req.user.name} accepted ${employee.name}'s resignation. Last working day: ${fmt(lastWorkingDay)}.`,
      emailDetails: note ? `Note: ${note}` : '',
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });

    const saved = await populateResignation(Resignation.findById(resignation._id));
    res.status(200).json({
      success: true,
      message: `Resignation accepted. ${employee.name}'s last working day is ${fmt(lastWorkingDay)}.`,
      resignation: withExitStatus(saved),
    });
  } catch (error) {
    console.error('Accept Resignation Error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept the resignation', error: error.message });
  }
};

// @desc    Reject a resignation
// @route   POST /api/resignations/:id/reject
// @access  Private (Admin, reporting Manager)
const rejectResignation = async (req, res) => {
  try {
    const loaded = await loadForDecision(req, res);
    if (!loaded) return;
    const { resignation, employee } = loaded;

    const note = String(req.body.note || '').trim().slice(0, 1000);
    resignation.status = 'Rejected';
    resignation.decidedBy = req.user._id;
    resignation.decidedAt = new Date();
    resignation.decisionNote = note;
    await resignation.save();

    notify({
      recipients: [employee._id],
      type: 'resignation_rejected',
      title: 'Your resignation was not accepted',
      message: `${req.user.name} did not accept your resignation dated ${fmt(resignation.resignationDate)}.${note ? ` Note: ${note}` : ''}`,
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });
    notify({
      recipients: await recipientsFor(employee, req.user._id),
      type: 'resignation_rejected',
      title: `Resignation rejected: ${employee.name}`,
      message: `${req.user.name} rejected ${employee.name}'s resignation.${note ? ` Note: ${note}` : ''}`,
      email: false,
      relatedEntity: { kind: 'Resignation', id: resignation._id },
    });

    const saved = await populateResignation(Resignation.findById(resignation._id));
    res.status(200).json({ success: true, message: 'Resignation rejected.', resignation: withExitStatus(saved) });
  } catch (error) {
    console.error('Reject Resignation Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject the resignation', error: error.message });
  }
};

module.exports = {
  submitResignation,
  getMyResignations,
  withdrawResignation,
  getResignations,
  acceptResignation,
  rejectResignation,
};
