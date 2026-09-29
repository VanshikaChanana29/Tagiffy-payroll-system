const Notification = require('../models/Notification');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const AttendanceRequest = require('../models/AttendanceRequest');
const Reimbursement = require('../models/Reimbursement');

// Records that belong to one employee through a userId field.
const OWNED_KINDS = { Leave, Attendance, AttendanceRequest, Reimbursement };
const SUBJECT_FIELDS = 'name email employeeId department designation avatar role status';

// Works out which employee each notification is about, so clicking it can open
// that person's record. Resolved at read time from relatedEntity, so it also
// covers notifications created before this existed.
const attachSubjects = async (notifications) => {
  const idsByKind = {};
  for (const n of notifications) {
    const { kind, id } = n.relatedEntity || {};
    if (kind && id) (idsByKind[kind] ||= []).push(id);
  }

  const userIdByEntity = new Map();
  await Promise.all(
    Object.entries(idsByKind).map(async ([kind, ids]) => {
      if (kind === 'User') {
        ids.forEach((id) => userIdByEntity.set(id.toString(), id.toString()));
      } else if (kind === 'UserDocument') {
        // Documents live inside the employee's own record.
        const owners = await User.find({ 'documents._id': { $in: ids } }).select('documents._id');
        for (const owner of owners) {
          for (const doc of owner.documents) userIdByEntity.set(doc._id.toString(), owner._id.toString());
        }
      } else if (OWNED_KINDS[kind]) {
        const records = await OWNED_KINDS[kind].find({ _id: { $in: ids } }).select('userId');
        records.forEach((r) => r.userId && userIdByEntity.set(r._id.toString(), r.userId.toString()));
      }
    })
  );

  const subjects = await User.find({ _id: { $in: [...new Set(userIdByEntity.values())] } }).select(SUBJECT_FIELDS);
  const subjectById = new Map(subjects.map((u) => [u._id.toString(), u]));

  return notifications.map((n) => {
    const obj = n.toJSON();
    const entityId = n.relatedEntity?.id?.toString();
    obj.subject = (entityId && subjectById.get(userIdByEntity.get(entityId))) || null;
    return obj;
  });
};

// @desc    Get current user's notifications, newest first
// @route   GET /api/notifications
// @access  Private
const getMyNotifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments({ recipient: req.user._id }),
    ]);

    res.status(200).json({
      success: true,
      data: await attachSubjects(notifications),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
  }
};

// @desc    Get current user's unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    res.status(200).json({ success: true, count });
  } catch (error) {
    console.error('Get Unread Count Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count', error: error.message });
  }
};

// @desc    Mark one notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
  }
};

// @desc    Mark all of the current user's notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark All Notifications Read Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
  }
};

module.exports = { getMyNotifications, getUnreadCount, markAsRead, markAllAsRead };
