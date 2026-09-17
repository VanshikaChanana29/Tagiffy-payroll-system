// One-off helper to seed a handful of departments and designations for manual
// testing (super admin → admin → bulk upload flows). Not wired into app
// startup — run directly with `node src/utils/seedTestOrgData.js`.
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Department = require('../models/Department');
const Designation = require('../models/Designation');

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dayflow_hrms';
  await mongoose.connect(mongoUri);
  console.log(`Connected: ${mongoUri}`);

  const departments = [
    { name: 'Engineering', code: 'ENG', description: 'Product engineering and platform' },
    { name: 'Human Resources', code: 'HR', description: 'People operations and hiring' },
    { name: 'Sales & Marketing', code: 'SNM', description: 'Revenue, growth, and brand' },
    { name: 'Design', code: 'DES', description: 'Product design and UX' },
  ];

  const createdDepts = {};
  for (const d of departments) {
    let dept = await Department.findOne({ name: d.name });
    if (!dept) {
      dept = await Department.create(d);
      console.log(`+ Department: ${dept.name}`);
    } else {
      console.log(`= Department already exists: ${dept.name}`);
    }
    createdDepts[d.name] = dept;
  }

  const designations = [
    { title: 'Software Engineer', department: 'Engineering' },
    { title: 'Engineering Manager', department: 'Engineering' },
    { title: 'HR Executive', department: 'Human Resources' },
    { title: 'Sales Executive', department: 'Sales & Marketing' },
    { title: 'Product Designer', department: 'Design' },
  ];

  for (const desig of designations) {
    const existing = await Designation.findOne({ title: desig.title });
    if (!existing) {
      await Designation.create({
        title: desig.title,
        department: createdDepts[desig.department]._id,
      });
      console.log(`+ Designation: ${desig.title} (${desig.department})`);
    } else {
      console.log(`= Designation already exists: ${desig.title}`);
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
