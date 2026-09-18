const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'leave_applied',
  'leave_approved',
  'leave_rejected',
  'leave_cancelled',
  'regularization_requested',
  'regularization_approved',
  'regularization_rejected',
  'attendance_outside_geofence',
  'attendance_late',
  'document_uploaded',
  'document_verified',
  'document_rejected',
  'payslip_generated',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    relatedEntity: {
      kind: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
