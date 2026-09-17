const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Salary = require('../models/Salary');

const inspectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dayflow_hrms';
  console.log('\n==================================================');
  console.log('🔍 DAYFLOW HRMS - DATABASE LAYER INSPECTOR');
  console.log('==================================================\n');
  console.log(`📡 Connecting to MongoDB URI: ${mongoUri}`);

  let connected = false;
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log(`✅ Connected successfully to standalone MongoDB server!\n`);
    connected = true;
  } catch (err) {
    console.log(`⚠️  Could not connect to standalone MongoDB (${err.message}).`);
    console.log(`🚀 Connecting to embedded in-memory MongoDB fallback...\n`);
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    await mongoose.connect(memUri);
    console.log(`✅ Connected to MongoMemoryServer: ${memUri}\n`);

    // Check if empty and seed
    const count = await User.countDocuments();
    if (count === 0) {
      console.log('🌱 Seeding initial demo data into memory DB...');
      const { seedDatabase } = require('./seedData');
      await seedDatabase(false);
      console.log('✅ Seeding completed!\n');
    }
  }

  // 1. Users Summary
  const users = await User.find().select('-password');
  console.log(`--------------------------------------------------`);
  console.log(`👥 USERS COLLECTION (${users.length} records):`);
  console.log(`--------------------------------------------------`);
  users.forEach((u) => {
    console.log(` • [${u.employeeId}] ${u.name.padEnd(16)} | Role: ${u.role.padEnd(8)} | Dept: ${u.department.padEnd(18)} | Email: ${u.email}`);
  });

  // 2. Attendance Summary
  const attendanceCount = await Attendance.countDocuments();
  const recentAttendance = await Attendance.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name employeeId');
  console.log(`\n--------------------------------------------------`);
  console.log(`🕐 ATTENDANCE COLLECTION (${attendanceCount} total records):`);
  console.log(`--------------------------------------------------`);
  recentAttendance.forEach((a) => {
    const empName = a.userId ? `${a.userId.name} (${a.userId.employeeId})` : 'Unknown User';
    console.log(` • Date: ${a.date} | Employee: ${empName.padEnd(25)} | Status: ${a.status.padEnd(8)} | Hours: ${a.totalHours} hrs`);
  });

  // 3. Leave Requests Summary
  const leaveCount = await Leave.countDocuments();
  const recentLeaves = await Leave.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name employeeId');
  console.log(`\n--------------------------------------------------`);
  console.log(`🌴 LEAVE COLLECTION (${leaveCount} total records):`);
  console.log(`--------------------------------------------------`);
  recentLeaves.forEach((l) => {
    const empName = l.userId ? `${l.userId.name} (${l.userId.employeeId})` : 'Unknown User';
    console.log(` • Type: ${l.leaveType.padEnd(6)} | Employee: ${empName.padEnd(25)} | Dates: ${l.startDate} to ${l.endDate} | Status: ${l.status}`);
  });

  // 4. Salary / Payroll Summary
  const salaryCount = await Salary.countDocuments();
  const recentSalaries = await Salary.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'name employeeId');
  console.log(`\n--------------------------------------------------`);
  console.log(`💰 SALARY / PAYROLL COLLECTION (${salaryCount} total records):`);
  console.log(`--------------------------------------------------`);
  recentSalaries.forEach((s) => {
    const empName = s.userId ? `${s.userId.name} (${s.userId.employeeId})` : 'Unknown User';
    console.log(` • Month/Year: ${s.month}/${s.year} | Employee: ${empName.padEnd(25)} | Gross: ₹${s.grossSalary} | Net: ₹${s.netSalary} | Status: ${s.paymentStatus}`);
  });

  console.log(`\n==================================================`);
  console.log(`✨ DB Inspection Finished.`);
  console.log(`==================================================\n`);

  await mongoose.disconnect();
  process.exit(0);
};

inspectDB();
