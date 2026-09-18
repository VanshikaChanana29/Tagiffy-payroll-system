const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD for fast date indexing
      required: true,
    },
    checkIn: {
      type: Date,
      default: null,
    },
    checkOut: {
      type: Date,
      default: null,
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half-day', 'Leave'],
      default: 'Present',
    },
    // Derived from the org shift settings whenever punches change.
    isLate: {
      type: Boolean,
      default: false,
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    earlyExitMinutes: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    // Set when an approved regularization request rewrote this day.
    isRegularized: {
      type: Boolean,
      default: false,
    },
    workMode: {
      type: String,
      enum: ['Office', 'Remote'],
      default: 'Office',
    },
    // GPS snapshot captured from the browser at the moment of each punch.
    // Null when the employee denied location permission.
    checkInLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      isOutsideGeofence: { type: Boolean, default: false },
      // Name of the nearest configured office, for display when there's more than one.
      matchedLocationName: { type: String, default: '' },
    },
    checkOutLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      isOutsideGeofence: { type: Boolean, default: false },
      matchedLocationName: { type: String, default: '' },
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee one attendance log per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
