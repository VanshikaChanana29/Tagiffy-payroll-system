const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'manager', 'employee'],
      default: 'employee',
    },
    department: {
      type: String,
      required: true,
      default: 'General',
    },
    designation: {
      type: String,
      required: true,
      default: 'Team Member',
    },
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    phone: {
      type: String,
      default: '',
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    avatar: {
      type: String,
      default: '',
    },
    // Filename of an uploaded photo on disk; empty when the avatar is generated initials.
    avatarFile: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      zip: { type: String, default: '' },
    },
    emergencyContact: {
      name: { type: String, default: '' },
      relation: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    bankDetails: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
    },
    // Current salary structure. Captured at onboarding from an annual CTC and
    // split by the org's configured percentages; HR may override any component.
    salary: {
      annualCtc: { type: Number, default: 0 },
      monthlyGross: { type: Number, default: 0 },
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      specialAllowance: { type: Number, default: 0 },
      pf: { type: Number, default: 0 },
      professionalTax: { type: Number, default: 0 },
      otherDeductions: { type: Number, default: 0 },
      // True when HR typed components by hand instead of deriving them from CTC.
      isCustom: { type: Boolean, default: false },
      effectiveFrom: { type: Date, default: null },
    },

    // A raise is a new revision, not an edit, so past payslips stay truthful and
    // the pay history is auditable.
    salaryHistory: [
      {
        annualCtc: { type: Number, default: 0 },
        monthlyGross: { type: Number, default: 0 },
        basic: { type: Number, default: 0 },
        hra: { type: Number, default: 0 },
        specialAllowance: { type: Number, default: 0 },
        pf: { type: Number, default: 0 },
        professionalTax: { type: Number, default: 0 },
        otherDeductions: { type: Number, default: 0 },
        effectiveFrom: { type: Date, default: null },
        note: { type: String, default: '' },
        revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        revisedByName: { type: String, default: '' },
        revisedAt: { type: Date, default: Date.now },
      },
    ],

    leaveBalance: {
      paid: { type: Number, default: 12 },
      sick: { type: Number, default: 8 },
      unpaid: { type: Number, default: 0 },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    verificationTokenExpires: {
      type: Date,
      default: null,
    },
    // Set on the user's first successful login; stays null until then so we can
    // tell a first-time sign-in (post-onboarding) apart from a returning one.
    lastLoginAt: {
      type: Date,
      default: null,
    },
    documents: [
      {
        name: { type: String, required: true },
        type: { type: String, required: true },
        // Real stored file. storedName is the generated filename on disk; it is
        // never exposed to the client, which downloads via the document id.
        storedName: { type: String, default: '' },
        originalName: { type: String, default: '' },
        mimeType: { type: String, default: 'application/pdf' },
        fileSizeBytes: { type: Number, default: 0 },
        fileSize: { type: String, default: '' },
        status: {
          type: String,
          enum: ['Verified', 'Pending Verification', 'Rejected'],
          default: 'Pending Verification',
        },
        // Audit trail: who uploaded it, and who accepted or rejected it, and when.
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        uploadedAt: { type: Date, default: Date.now },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedByName: { type: String, default: '' },
        reviewedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: '' },
      },
    ],

    // Company property assigned to this employee (laptop, phone, etc). HR can
    // assign assets to anyone; the employee can also keep their own up to date.
    assets: [
      {
        title: { type: String, required: true, trim: true },
        assetNumber: { type: String, required: true, trim: true },
        assetType: { type: String, required: true, trim: true },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        assignedByName: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedByName: { type: String, default: '' },
        updatedAt: { type: Date, default: null },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Exclude password in JSON response
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
