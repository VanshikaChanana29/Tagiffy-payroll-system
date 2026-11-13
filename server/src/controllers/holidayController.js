const Holiday = require('../models/Holiday');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Normalises a scope list from the request body (departments or branch ids).
const cleanList = (list) =>
  Array.isArray(list) ? [...new Set(list.map((v) => String(v).trim()).filter(Boolean))] : [];

// @desc    List holidays, optionally for one year
// @route   GET /api/holidays?year=2026
// @access  Private (everyone — employees need to see the calendar)
const getHolidays = async (req, res) => {
  try {
    const { year, from, to } = req.query;

    const query = {};
    if (year) {
      query.date = { $regex: `^${year}-` };
    } else if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });
    const todayStr = new Date().toISOString().slice(0, 10);

    res.status(200).json({
      success: true,
      count: holidays.length,
      upcoming: holidays.filter((h) => h.date >= todayStr).slice(0, 5),
      holidays,
    });
  } catch (error) {
    console.error('Get Holidays Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve holidays',
      error: error.message,
    });
  }
};

// @desc    Add a holiday
// @route   POST /api/holidays
// @access  Private (Admin only)
const createHoliday = async (req, res) => {
  try {
    const { name, date, type = 'Public', description = '', departments, officeLocationIds } = req.body;

    if (!name || !name.trim() || !date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both a holiday name and a date.',
      });
    }

    if (!DATE_PATTERN.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format.',
      });
    }

    const existing = await Holiday.findOne({ date });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `${existing.name} is already marked as a holiday on ${date}.`,
      });
    }

    const holiday = await Holiday.create({
      name: name.trim(),
      date,
      type,
      description: description.trim(),
      departments: cleanList(departments),
      officeLocationIds: cleanList(officeLocationIds),
    });

    res.status(201).json({
      success: true,
      message: `${holiday.name} added to the holiday calendar.`,
      holiday,
    });
  } catch (error) {
    console.error('Create Holiday Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add holiday',
      error: error.message,
    });
  }
};

// @desc    Update a holiday
// @route   PUT /api/holidays/:id
// @access  Private (Admin only)
const updateHoliday = async (req, res) => {
  try {
    const { name, date, type, description, departments, officeLocationIds } = req.body;

    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }

    if (date !== undefined) {
      if (!DATE_PATTERN.test(date)) {
        return res.status(400).json({
          success: false,
          message: 'Date must be in YYYY-MM-DD format.',
        });
      }
      const clash = await Holiday.findOne({ date, _id: { $ne: holiday._id } });
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `${clash.name} already occupies ${date}.`,
        });
      }
      holiday.date = date;
    }

    if (name !== undefined && name.trim()) holiday.name = name.trim();
    if (type !== undefined) holiday.type = type;
    if (description !== undefined) holiday.description = description.trim();
    if (departments !== undefined) holiday.departments = cleanList(departments);
    if (officeLocationIds !== undefined) holiday.officeLocationIds = cleanList(officeLocationIds);

    await holiday.save();

    res.status(200).json({
      success: true,
      message: `${holiday.name} updated.`,
      holiday,
    });
  } catch (error) {
    console.error('Update Holiday Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update holiday',
      error: error.message,
    });
  }
};

// @desc    Remove a holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Admin only)
const deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }

    await holiday.deleteOne();

    res.status(200).json({
      success: true,
      message: `${holiday.name} removed from the holiday calendar.`,
    });
  } catch (error) {
    console.error('Delete Holiday Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete holiday',
      error: error.message,
    });
  }
};

/**
 * Holiday dates in a range, as a { 'YYYY-MM-DD': name } map.
 * Shared by attendance, leave and payroll so all three agree on what is a
 * working day.
 *
 * A holiday is scoped on two independent axes, each empty meaning "all":
 *   - `departments`       — matched against the employee's department
 *   - `officeLocationIds` — matched against the employee's branch
 * It applies to an employee only when both axes cover them. So pass the
 * employee's department AND officeLocationId for every per-employee
 * calculation; an employee with no branch assigned only gets holidays that
 * are not branch-scoped.
 */
const getHolidayMap = async (fromDateStr, toDateStr, department = null, officeLocationId = null) => {
  const holidays = await Holiday.find({
    date: { $gte: fromDateStr, $lte: toDateStr },
    // Restricted holidays are optional, so they do not close the office.
    type: { $ne: 'Restricted' },
  });

  const branch = officeLocationId ? String(officeLocationId) : null;
  const map = {};
  holidays.forEach((h) => {
    const depts = h.departments || [];
    const branches = h.officeLocationIds || [];
    const deptOk = depts.length === 0 || (department && depts.includes(department));
    const branchOk = branches.length === 0 || (branch && branches.includes(branch));
    if (deptOk && branchOk) {
      map[h.date] = h.name;
    }
  });
  return map;
};

module.exports = {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidayMap,
};
