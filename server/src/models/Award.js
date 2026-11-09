const mongoose = require('mongoose');

/**
 * An Employee of the Month award.
 *
 * Awarded per department: each department usually gets one winner a month,
 * sometimes up to four (the cap lives in the award controller). The department is
 * snapshotted at award time so a later transfer doesn't move old awards.
 */
const awardSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    // Why they won — shown on the dashboard and in the announcement.
    citation: {
      type: String,
      default: '',
      trim: true,
    },
    // Optional photo for the award (e.g. receiving it), shown on the dashboard.
    // photo is the public URL; photoFile is the stored name, for deletion.
    photo: {
      type: String,
      default: '',
    },
    photoFile: {
      type: String,
      default: '',
    },
    awardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Null until the certificate email actually goes out (Brevo may be
    // unconfigured or fail), so HR can see who still needs a resend.
    certificateEmailedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// One award per person per month.
awardSchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });
awardSchema.index({ year: -1, month: -1, department: 1 });

module.exports = mongoose.model('Award', awardSchema);
