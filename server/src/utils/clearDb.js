const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const AttendanceRequest = require('../models/AttendanceRequest');
const Leave = require('../models/Leave');
const Salary = require('../models/Salary');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const OrgSettings = require('../models/OrgSettings');
const Holiday = require('../models/Holiday');
const { buildInitialsAvatar } = require('./initialsAvatar');

// Pass --bare to wipe everything with zero users, including the bootstrap
// super admin. Without it, one super_admin account is left so there's a way
// to log in and build the org back up from the UI.
const bare = process.argv.includes('--bare');

const clearDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dayflow_hrms';
  console.log('\n==================================================');
  console.log('🧹 DAYFLOW HRMS - CLEAR DATABASE DATA');
  console.log('==================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log(`✅ Connected to Standalone MongoDB: ${mongoUri}`);
  } catch (err) {
    console.log(`⚠️  Could not connect to standalone MongoDB at ${mongoUri}.`);
    console.log(`Starting in-memory Mongo connection to purge...`);
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    await mongoose.connect(memUri);
  }

  console.log('🗑️  Deleting all User records...');
  await User.deleteMany({});

  console.log('🗑️  Deleting all Attendance records...');
  await Attendance.deleteMany({});

  console.log('🗑️  Deleting all Leave records...');
  await Leave.deleteMany({});

  console.log('🗑️  Deleting all Salary records...');
  await Salary.deleteMany({});

  console.log('🗑️  Deleting all Department records...');
  await Department.deleteMany({});

  console.log('🗑️  Deleting all Designation records...');
  await Designation.deleteMany({});

  console.log('🗑️  Deleting all Attendance Request records...');
  await AttendanceRequest.deleteMany({});

  console.log('🗑️  Deleting all Holiday records...');
  await Holiday.deleteMany({});

  console.log('🗑️  Deleting Org Settings...');
  await OrgSettings.deleteMany({});

  console.log('\n==================================================');
  console.log('✨ All collections have been completely cleared / emptied!');
  console.log('==================================================\n');

  if (!bare) {
    console.log('🛡️  Seeding one bootstrap super admin so you can still log in...');
    const owner = new User({
      employeeId: 'EMP-000',
      name: 'Owner Account',
      email: 'owner@dayflow.com',
      password: 'owner123',
      role: 'super_admin',
      department: 'General',
      designation: 'Founder',
      avatar: buildInitialsAvatar('Owner Account', 'owner@dayflow.com'),
      status: 'Active',
      isVerified: true,
    });
    await owner.save();
    console.log('\n🔑 Bootstrap login: owner@dayflow.com / owner123');
    console.log('   Everything else — departments, designations, other users — is empty.');
    console.log('   Set up departments/designations in Org Settings before onboarding employees.\n');
  }

  await mongoose.disconnect();
  process.exit(0);
};

clearDatabase();
