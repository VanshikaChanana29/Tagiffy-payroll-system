const mongoose = require('mongoose');

/**
 * Organisation-wide work rules. A single document drives shift timings, what
 * counts as late, and when overtime starts — so these numbers live in one place
 * instead of being hardcoded across the attendance controller.
 */
const orgSettingsSchema = new mongoose.Schema(
  {
    // Marker for the singleton document.
    key: { type: String, default: 'default', unique: true },

    companyName: { type: String, default: 'WorkZen' },

    // Shift window in 24-hour "HH:mm", interpreted in the server's timezone.
    shiftStart: { type: String, default: '09:30' },
    shiftEnd: { type: String, default: '18:30' },

    // Minutes after shiftStart before a check-in counts as late.
    graceMinutes: { type: Number, default: 15 },

    // Hours worked needed for each status.
    fullDayHours: { type: Number, default: 8 },
    halfDayHours: { type: Number, default: 4 },

    // Overtime accrues once someone passes this many hours in a day.
    overtimeAfterHours: { type: Number, default: 9 },

    // 0 = Sunday ... 6 = Saturday. Default is a Monday–Friday week.
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },

    // Office coordinates for geofenced punches. Null until an admin sets it —
    // punches are not distance-checked until then.
    officeLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      address: { type: String, default: '' },
    },

    // Punches beyond this distance from officeLocation are flagged as "away".
    geofenceRadiusMeters: { type: Number, default: 200 },

    // --- Salary rules ---
    // Monthly pay is simply CTC / 12. The only settings left are how loss of
    // pay is priced and whether absent days cost pay.
    salaryStructure: {
      // Per-day pay for loss of pay: divide monthly pay by the calendar days in
      // the month, or by that month's working days.
      lopBasis: {
        type: String,
        enum: ['calendarDays', 'workingDays'],
        default: 'calendarDays',
      },
      // Whether an unexplained absent day costs a day's pay, alongside approved
      // unpaid leave. Off by default.
      countAbsentAsLop: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Always returns the live settings, creating defaults on first use.
orgSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'default' });
  if (!settings) {
    settings = await this.create({ key: 'default' });
  }
  return settings;
};

module.exports = mongoose.model('OrgSettings', orgSettingsSchema);
