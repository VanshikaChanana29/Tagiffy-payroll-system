/**
 * Starts a real, persistent, local MongoDB server for development.
 *
 * MongoDB is not installed on this machine as a Windows service, so instead of
 * the throwaway in-memory database (which wiped every record on restart), this
 * launches the genuine mongod binary against a permanent data directory.
 * Everything written survives restarts.
 *
 * Usage: npm run db:start   (leave this terminal running)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

const DB_PATH = process.env.MONGO_DB_PATH || path.resolve(__dirname, '../../.mongodb-data');
const PORT = process.env.MONGO_PORT || 27017;
const MONGO_VERSION = process.env.MONGO_VERSION || '7.0.24';
const LOG_PATH = path.join(DB_PATH, 'mongod.log');

// Resolve the mongod binary: prefer an already-cached copy, download it once if missing.
const resolveBinary = async () => {
  const cachedBinary = path.join(
    os.homedir(),
    '.cache',
    'mongodb-binaries',
    `mongod-x64-win32-${MONGO_VERSION}.exe`
  );
  if (fs.existsSync(cachedBinary)) return cachedBinary;

  console.log(`⬇️  mongod ${MONGO_VERSION} not cached yet — downloading once (~100 MB)...`);
  const { MongoBinary } = require('mongodb-memory-server-core/lib/util/MongoBinary');
  return MongoBinary.getPath({ version: MONGO_VERSION });
};

// A second mongod cannot open the same data directory, so if one is already
// listening we reuse it instead of crashing the whole dev stack.
const isAlreadyRunning = () =>
  new Promise((resolve) => {
    const socket = net.connect(Number(PORT), '127.0.0.1');
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });

(async () => {
  try {
    if (await isAlreadyRunning()) {
      console.log(`✅ MongoDB is already running on port ${PORT} — reusing it.`);
      console.log('   (Nothing to do here. Leave this process running.)');
      // Idle instead of exiting, so `concurrently` does not tear down the other tasks.
      setInterval(() => {}, 1 << 30);
      return;
    }

    fs.mkdirSync(DB_PATH, { recursive: true });

    const binary = await resolveBinary();

    console.log('🗄️  Starting persistent local MongoDB');
    console.log(`   binary : ${binary}`);
    console.log(`   data   : ${DB_PATH}`);
    console.log(`   uri    : mongodb://127.0.0.1:${PORT}/dayflow_hrms`);
    console.log(`   log    : ${LOG_PATH}`);
    console.log('   Keep this running. Data persists across restarts.');

    // mongod's own JSON log goes to a file, not the shared dev terminal.
    const mongod = spawn(
      binary,
      [
        '--dbpath', DB_PATH,
        '--port', String(PORT),
        '--bind_ip', '127.0.0.1',
        '--logpath', LOG_PATH,
        '--logappend',
      ],
      { stdio: 'inherit' }
    );

    // Announce readiness ourselves, since the startup banner now goes to the log file.
    (async () => {
      for (let i = 0; i < 60; i++) {
        if (await isAlreadyRunning()) {
          console.log(`✅ MongoDB ready on port ${PORT}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    })();

    mongod.on('error', (err) => {
      console.error(`❌ Failed to start mongod: ${err.message}`);
      process.exit(1);
    });

    mongod.on('exit', (code) => {
      if (code !== 0) {
        console.error(`
❌ mongod exited with code ${code}.`);
        if (code === 100) {
          console.error('   Code 100 usually means the data directory is locked or needs recovery.');
          console.error(`   Check that no other mongod is using: ${DB_PATH}`);
        }
        // The real reason is in the log file, so surface the tail of it.
        try {
          const NEWLINE = String.fromCharCode(10);
          const tail = fs.readFileSync(LOG_PATH, 'utf8').trim().split(NEWLINE).slice(-5);
          console.error(`   Last lines of ${LOG_PATH}:`);
          tail.forEach((line) => console.error(`     ${line}`));
        } catch {
          console.error(`   See ${LOG_PATH} for details.`);
        }
      }
      process.exit(code ?? 0);
    });

    // Shut the database down cleanly so WiredTiger never leaves a locked data dir behind.
    const shutdown = () => {
      console.log('\n🛑 Stopping MongoDB...');
      mongod.kill('SIGINT');
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error(`❌ Could not start local MongoDB: ${error.message}`);
    process.exit(1);
  }
})();
