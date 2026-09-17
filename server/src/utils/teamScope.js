const User = require('../models/User');
const { isAdminRole } = require('./roles');

/**
 * Works out which employees a request is allowed to see.
 *
 * Admins see the whole organisation. Managers see only the people who report to
 * them — the same screens, a narrower slice of data. Scoping happens here, in
 * one place, rather than being re-derived in every controller.
 *
 * Returns null for unrestricted access, or an array of ObjectIds to filter by.
 */
const getVisibleUserIds = async (user) => {
  if (!user) return [];
  if (isAdminRole(user.role)) return null;

  if (user.role === 'manager') {
    const reports = await User.find({ reportingManager: user._id }).select('_id');
    // A manager can always see their own records alongside their team's.
    return [...reports.map((r) => r._id), user._id];
  }

  // Employees only ever see themselves.
  return [user._id];
};

/** True when this user is allowed to act on the given employee's records. */
const canManageEmployee = async (user, targetUserId) => {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;

  const visible = await getVisibleUserIds(user);
  if (visible === null) return true;
  return visible.some((id) => id.toString() === targetUserId.toString());
};

/** A manager's direct reports, excluding themselves. */
const getDirectReports = async (managerId) =>
  User.find({ reportingManager: managerId })
    .select('-password')
    .populate('reportingManager', 'name employeeId email')
    .sort({ name: 1 });

module.exports = { getVisibleUserIds, canManageEmployee, getDirectReports };
