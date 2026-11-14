const mongoose = require('mongoose');
const EmployeeExit = require('../models/EmployeeExit');
const { EXIT_TYPES, exitStatus, startOfToday } = require('../models/EmployeeExit');
const User = require('../models/User');
const { isAdminRole, isSuperAdmin } = require('../utils/roles');
const { processDueExits } = require('../utils/exitScheduler');
const Resignation = require('../models/Resignation');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');
const { format } = require('date-fns');

/** 'YYYY-MM-DD' → local midnight Date, or null if malformed. */
const parseDateOnly = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

const withStatus = (exit) => ({ ...exit.toObject(), status: exitStatus(exit) });

/** Validates type, dates and reason from the request body. */
const readExitFields = (body) => {
  const { exitType, reason = '' } = body;
  if (!EXIT_TYPES.includes(exitType)) {
    return { error: `Exit type must be one of: ${EXIT_TYPES.join(', ')}.` };
  }
  const noticeDate = parseDateOnly(body.noticeDate);
  const lastWorkingDay = parseDateOnly(body.lastWorkingDay);
  if (!noticeDate || !lastWorkingDay) {
    return { error: 'Please enter valid dates for the notice / termination date and the last working day.' };
  }
  if (lastWorkingDay < noticeDate) {
    return { error: 'The last working day cannot be before the resignation / termination date.' };
  }
  return { value: { exitType, noticeDate, lastWorkingDay, reason: String(reason).trim().slice(0, 1000) } };
};

/** HR admins may not record exits for other admins; that's a super admin's call. */
const canManage = (actor, employee) => {
  if (employee._id.toString() === actor._id.toString()) {
    return 'You cannot record your own exit.';
  }
  if (isAdminRole(employee.role) && !isSuperAdmin(actor.role)) {
    return 'Only a super admin can record an exit for an admin account.';
  }
  return null;
};

const populateExit = (query) =>
  query.populate('recordedBy', 'name').populate('withdrawnBy', 'name').populate('relievedEarlyBy', 'name').populate('employee', 'status avatar');

// @desc    The exit register
// @route   GET /api/exits?status=&type=&year=
// @access  Private (Admin)
const getExits = async (req, res) => {
  try {
    const query = {};
    if (req.query.type && EXIT_TYPES.includes(req.query.type)) query.exitType = req.query.type;
    const year = Number(req.query.year);
    if (year) {
      query.lastWorkingDay = { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) };
    }
    // Status is derived from dates, so translate it into a query.
    const today = startOfToday();
    if (req.query.status === 'Withdrawn') query.withdrawnAt = { $ne: null };
    if (req.query.status === 'Exited') {
      query.withdrawnAt = null;
      query.lastWorkingDay = { ...(query.lastWorkingDay || {}), $lt: today };
    }
    if (req.query.status === 'Serving Notice') {
      query.withdrawnAt = null;
      query.lastWorkingDay = { ...(query.lastWorkingDay || {}), $gte: today };
    }

    const exits = await populateExit(EmployeeExit.find(query).sort({ lastWorkingDay: -1, createdAt: -1 }));
    res.status(200).json({ success: true, exits: exits.map(withStatus) });
  } catch (error) {
    console.error('Get Exits Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the exit register', error: error.message });
  }
};

// @desc    Record an employee exit (resignation, termination, ...)
// @route   POST /api/exits
// @access  Private (Admin)
const createExit = async (req, res) => {
  try {
    const { employeeId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Please choose an employee.' });
    }
    const { value, error } = readExitFields(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const employee = await User.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const denied = canManage(req.user, employee);
    if (denied) return res.status(403).json({ success: false, message: denied });
    if (employee.status !== 'Active') {
      return res.status(400).json({ success: false, message: `${employee.name} is already inactive.` });
    }

    const pending = await EmployeeExit.exists({
      employee: employee._id,
      withdrawnAt: null,
      deactivatedAt: null,
    });
    if (pending) {
      return res.status(400).json({
        success: false,
        message: `${employee.name} already has an exit recorded. Edit or withdraw it instead.`,
      });
    }

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
      ...value,
      recordedBy: req.user._id,
    });

    // If the last working day is already behind us, deactivate right away.
    await processDueExits();
    const saved = await populateExit(EmployeeExit.findById(exit._id));
    const status = exitStatus(saved);

    res.status(201).json({
      success: true,
      message:
        status === 'Exited'
          ? `Exit recorded. ${employee.name}'s account is now inactive.`
          : `Exit recorded. ${employee.name} stays active until the last working day, then is deactivated automatically.`,
      exit: withStatus(saved),
    });
  } catch (error) {
    console.error('Create Exit Error:', error);
    res.status(500).json({ success: false, message: 'Failed to record the exit', error: error.message });
  }
};

// @desc    Correct an exit record (type, dates, reason)
// @route   PUT /api/exits/:id
// @access  Private (Admin)
const updateExit = async (req, res) => {
  try {
    const exit = await EmployeeExit.findById(req.params.id);
    if (!exit) return res.status(404).json({ success: false, message: 'Exit record not found' });
    if (exit.withdrawnAt) {
      return res.status(400).json({ success: false, message: 'This exit was withdrawn and can no longer be edited.' });
    }
    const employee = await User.findById(exit.employee);
    if (employee) {
      const denied = canManage(req.user, employee);
      if (denied) return res.status(403).json({ success: false, message: denied });
    }

    const { value, error } = readExitFields(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    Object.assign(exit, value);
    await exit.save();
    await processDueExits();

    const saved = await populateExit(EmployeeExit.findById(exit._id));
    res.status(200).json({ success: true, message: 'Exit record updated.', exit: withStatus(saved) });
  } catch (error) {
    console.error('Update Exit Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update the exit record', error: error.message });
  }
};

// @desc    Withdraw an exit before the last working day (resignation taken back)
// @route   POST /api/exits/:id/withdraw
// @access  Private (Admin)
const withdrawExit = async (req, res) => {
  try {
    const exit = await EmployeeExit.findById(req.params.id);
    if (!exit) return res.status(404).json({ success: false, message: 'Exit record not found' });
    if (exit.withdrawnAt) {
      return res.status(400).json({ success: false, message: 'This exit is already withdrawn.' });
    }
    if (exit.deactivatedAt) {
      return res.status(400).json({
        success: false,
        message: 'This person has already left. To bring them back, reactivate them from the Employees page.',
      });
    }
    const employee = await User.findById(exit.employee);
    if (employee) {
      const denied = canManage(req.user, employee);
      if (denied) return res.status(403).json({ success: false, message: denied });
    }

    exit.withdrawnAt = new Date();
    exit.withdrawnBy = req.user._id;
    await exit.save();

    const saved = await populateExit(EmployeeExit.findById(exit._id));
    res.status(200).json({
      success: true,
      message: `Exit withdrawn. ${exit.snapshot.name} stays active.`,
      exit: withStatus(saved),
    });
  } catch (error) {
    console.error('Withdraw Exit Error:', error);
    res.status(500).json({ success: false, message: 'Failed to withdraw the exit', error: error.message });
  }
};

// @desc    Relieve someone before their agreed last working day
// @route   POST /api/exits/:id/relieve-early
// @access  Private (Admin)
const relieveEarly = async (req, res) => {
  try {
    const exit = await EmployeeExit.findById(req.params.id);
    if (!exit) return res.status(404).json({ success: false, message: 'Exit record not found' });
    if (exitStatus(exit) !== 'Serving Notice' || exit.deactivatedAt) {
      return res.status(400).json({ success: false, message: 'Only someone still serving notice can be relieved early.' });
    }
    const employee = await User.findById(exit.employee);
    if (employee) {
      const denied = canManage(req.user, employee);
      if (denied) return res.status(403).json({ success: false, message: denied });
    }

    const lastWorkingDay = parseDateOnly(req.body.lastWorkingDay);
    if (!lastWorkingDay) {
      return res.status(400).json({ success: false, message: 'Please enter a valid new last working day.' });
    }
    if (lastWorkingDay >= exit.lastWorkingDay) {
      return res.status(400).json({ success: false, message: 'The new last working day must be before the current one.' });
    }
    if (lastWorkingDay < exit.noticeDate) {
      return res.status(400).json({ success: false, message: 'The last working day cannot be before the resignation / termination date.' });
    }
    const reason = String(req.body.reason || '').trim().slice(0, 1000);
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Please give a reason for relieving early.' });
    }

    const previous = exit.lastWorkingDay;
    if (!exit.originalLastWorkingDay) exit.originalLastWorkingDay = previous;
    exit.lastWorkingDay = lastWorkingDay;
    exit.earlyReliefReason = reason;
    exit.relievedEarlyAt = new Date();
    exit.relievedEarlyBy = req.user._id;
    await exit.save();

    const resignation = await Resignation.findOne({ exit: exit._id });
    if (resignation) {
      resignation.lastWorkingDay = lastWorkingDay;
      await resignation.save();
    }

    await processDueExits();

    const fmt = (d) => format(d, 'dd MMM yyyy');
    const name = exit.snapshot.name;
    const relatedEntity = resignation
      ? { kind: 'Resignation', id: resignation._id }
      : { kind: 'User', id: exit.employee };
    notify({
      recipients: [exit.employee],
      type: 'resignation_relieved_early',
      title: 'Your last working day has been moved up',
      message: `You are being relieved early. Your last working day is now ${fmt(lastWorkingDay)} (earlier ${fmt(previous)}).`,
      emailDetails: `Reason: ${reason}`,
      relatedEntity,
    });
    if (employee) {
      notify({
        recipients: (await getEscalationRecipientIds(employee)).filter((id) => id.toString() !== req.user._id.toString()),
        type: 'resignation_relieved_early',
        title: `Relieved early: ${name}`,
        message: `${req.user.name} moved ${name}'s last working day up to ${fmt(lastWorkingDay)} (earlier ${fmt(previous)}).`,
        emailDetails: `Reason: ${reason}`,
        relatedEntity,
      });
    }

    const saved = await populateExit(EmployeeExit.findById(exit._id));
    const status = exitStatus(saved);
    res.status(200).json({
      success: true,
      message:
        status === 'Exited'
          ? `${name} has been relieved and the account is now inactive.`
          : `${name} will be relieved on ${fmt(lastWorkingDay)}.`,
      exit: withStatus(saved),
    });
  } catch (error) {
    console.error('Relieve Early Error:', error);
    res.status(500).json({ success: false, message: 'Failed to relieve early', error: error.message });
  }
};

module.exports = { getExits, createExit, updateExit, withdrawExit, relieveEarly, parseDateOnly };
