const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const readline = require('readline');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Salary = require('../models/Salary');

const startConsole = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dayflow_hrms';
  console.log('\n==================================================');
  console.log('⚡ DAYFLOW HRMS - INTERACTIVE MONGO SHELL / CONSOLE');
  console.log('==================================================\n');

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log(`✅ Connected to Standalone MongoDB: ${mongoUri}\n`);
  } catch (err) {
    console.log(`⚠️  Could not connect to localhost:27017. Starting in-memory database...`);
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    await mongoose.connect(memUri);
    console.log(`✅ Connected to In-Memory MongoDB: ${memUri}\n`);

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Seeding demo database records...');
      const { seedDatabase } = require('./seedData');
      await seedDatabase(false);
      console.log('✅ Demo records seeded successfully!\n');
    }
  }

  console.log('💡 QUICK SHELL COMMANDS:');
  console.log('  1. show tables / show collections -> List all database collections');
  console.log('  2. users                         -> View all users / employee profiles');
  console.log('  3. attendance                    -> View recent attendance records');
  console.log('  4. leaves                        -> View all leave applications');
  console.log('  5. salaries                      -> View all payroll / salary records');
  console.log('  6. exit / quit                   -> Exit the shell');
  console.log('--------------------------------------------------\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'dayflow-mongo> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim().toLowerCase();
    switch (input) {
      case 'exit':
      case 'quit':
        console.log('Bye!');
        await mongoose.disconnect();
        process.exit(0);
        break;

      case 'show tables':
      case 'show collections':
      case 'tables':
      case 'collections':
        const collections = Object.keys(mongoose.connection.collections);
        console.log('\n📁 COLLECTIONS IN DATABASE:');
        collections.forEach((c) => console.log(` - ${c}`));
        console.log('');
        break;

      case 'users':
      case 'db.users.find()':
        const users = await User.find().select('-password');
        console.log('\n👥 USERS TABLE:');
        console.table(
          users.map((u) => ({
            EmpID: u.employeeId,
            Name: u.name,
            Role: u.role,
            Dept: u.department,
            Email: u.email,
          }))
        );
        break;

      case 'attendance':
      case 'db.attendances.find()':
        const att = await Attendance.find().limit(10).populate('userId', 'name employeeId');
        console.log('\n🕐 ATTENDANCE TABLE (Top 10):');
        console.table(
          att.map((a) => ({
            Date: a.date,
            Employee: a.userId ? `${a.userId.name} (${a.userId.employeeId})` : 'N/A',
            Status: a.status,
            Hours: a.totalHours,
          }))
        );
        break;

      case 'leaves':
      case 'db.leaves.find()':
        const leaves = await Leave.find().populate('userId', 'name employeeId');
        console.log('\n🌴 LEAVES TABLE:');
        console.table(
          leaves.map((l) => ({
            Type: l.leaveType,
            Employee: l.userId ? `${l.userId.name} (${l.userId.employeeId})` : 'N/A',
            StartDate: l.startDate,
            EndDate: l.endDate,
            Days: l.daysCount,
            Status: l.status,
          }))
        );
        break;

      case 'salaries':
      case 'db.salaries.find()':
        const salaries = await Salary.find().populate('userId', 'name employeeId');
        console.log('\n💰 SALARIES TABLE:');
        console.table(
          salaries.map((s) => ({
            Period: `${s.month}/${s.year}`,
            Employee: s.userId ? `${s.userId.name} (${s.userId.employeeId})` : 'N/A',
            Basic: s.basicSalary,
            Gross: s.grossSalary,
            Net: s.netSalary,
            Status: s.paymentStatus,
          }))
        );
        break;

      default:
        if (input !== '') {
          console.log(`Unknown command: "${input}". Try "collections", "users", "attendance", "leaves", "salaries", or "exit".`);
        }
        break;
    }
    rl.prompt();
  });
};

startConsole();
