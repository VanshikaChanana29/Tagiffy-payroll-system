const User = require('../models/User');
const Notification = require('../models/Notification');
const { isAdminRole } = require('./roles');
const { sendEmail } = require('./emailService');

/** Every HR admin / owner (admin + super_admin) — org-wide recipients. */
const getHrAndOwnerIds = async () => {
  const users = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id');
  return users.map((u) => u._id);
};

/**
 * Recipients for an event raised by/about `employee`: HR/owner always, plus
 * the employee's manager if they have one and aren't already admin-tier
 * themselves (avoids double-notifying an admin who happens to be a manager).
 */
const getEscalationRecipientIds = async (employee) => {
  const ids = await getHrAndOwnerIds();
  const idSet = new Set(ids.map((id) => id.toString()));

  if (employee?.reportingManager && !isAdminRole(employee.role)) {
    idSet.add(employee.reportingManager.toString());
  }

  return Array.from(idSet);
};

/**
 * Creates one Notification per recipient and fires (non-blocking) emails.
 * Never throws — a notification failure must not break the caller's request.
 */
const notify = async ({ recipients, type, title, message, relatedEntity = null }) => {
  try {
    const recipientIds = (recipients || []).filter(Boolean).map((id) => id.toString());
    const uniqueIds = [...new Set(recipientIds)];
    if (uniqueIds.length === 0) return;

    const docs = uniqueIds.map((recipient) => ({
      recipient,
      type,
      title,
      message,
      relatedEntity: relatedEntity ? { kind: relatedEntity.kind, id: relatedEntity.id } : undefined,
    }));

    const created = await Notification.insertMany(docs);

    const users = await User.find({ _id: { $in: uniqueIds } }).select('email');
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));

    await Promise.all(
      created.map(async (doc) => {
        const email = emailById.get(doc.recipient.toString());
        const sent = await sendEmail({ to: email, subject: title, text: message });
        if (sent) {
          doc.emailSent = true;
          await doc.save();
        }
      })
    );
  } catch (err) {
    console.error('🔔 Failed to send notification:', err.message);
  }
};

module.exports = { notify, getHrAndOwnerIds, getEscalationRecipientIds };
