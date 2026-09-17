const mongoose = require('mongoose');

let mongoMemoryServer = null;

// Last-resort throwaway database. Everything written to it is lost the moment the
// process exits, so it is opt-in only (ALLOW_MEMORY_DB=true) and never silent.
const connectMemoryFallback = async () => {
  console.warn('⚠️  ALLOW_MEMORY_DB is enabled — starting a THROWAWAY in-memory database.');
  console.warn('⚠️  Every record you create will be DELETED when this server stops.');

  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoMemoryServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoMemoryServer.getUri());

  console.log('✅ In-memory MongoDB connected (data is NOT persistent)');
};

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dayflow_hrms';

  try {
    console.log(`📡 Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB connected: ${mongoose.connection.host} (persistent)`);
  } catch (primaryErr) {
    console.error(`\n❌ Could not reach MongoDB at ${mongoUri}`);
    console.error(`   ${primaryErr.message}\n`);

    if (process.env.ALLOW_MEMORY_DB === 'true') {
      try {
        await connectMemoryFallback();
      } catch (memErr) {
        console.error(`❌ In-memory fallback also failed: ${memErr.message}`);
        process.exit(1);
      }
    } else {
      console.error('   Start the database first, in its own terminal:');
      console.error('     npm run db:start\n');
      console.error('   Or point MONGODB_URI in server/.env at a hosted database (e.g. MongoDB Atlas).');
      console.error('   Only for a quick throwaway demo, set ALLOW_MEMORY_DB=true — data will not persist.\n');
      process.exit(1);
    }
  }

  try {
    // Seed the demo dataset only into a genuinely empty database.
    const User = require('../models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0 && process.env.AUTO_SEED !== 'false') {
      console.log('🌱 Database is empty. Seeding demo HR and employee accounts...');
      const { seedDatabase } = require('../utils/seedData');
      await seedDatabase(false);
    } else {
      console.log(`📊 Existing data found: ${userCount} user account(s) — skipping seed.`);
    }
  } catch (seedErr) {
    console.error(`⚠️  Startup seed check failed: ${seedErr.message}`);
  }
};

module.exports = connectDB;
