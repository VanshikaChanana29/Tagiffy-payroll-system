const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    headId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Earned leave credited to everyone in this department at the start of each
    // month. Unused days lapse at month end — nothing carries forward. Null
    // means "use the company default" (OrgSettings.leavePolicy.earnedPerMonth).
    leavePolicy: {
      earnedPerMonth: { type: Number, default: null, min: 0, max: 31 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Department', departmentSchema);
