const EmployeeExit = require('../models/EmployeeExit');
const { startOfToday } = require('../models/EmployeeExit');
const User = require('../models/User');

const CHECK_EVERY_MS = 60 * 60 * 1000; // hourly

/**
 * Deactivates everyone whose last working day has passed. Each exit is
 * processed once (deactivatedAt is stamped), so reactivating a person by hand
 * afterwards sticks.
 */
const processDueExits = async () => {
  const due = await EmployeeExit.find({
    withdrawnAt: null,
    deactivatedAt: null,
    lastWorkingDay: { $lt: startOfToday() },
  });

  let deactivated = 0;
  for (const exit of due) {
    const result = await User.updateOne(
      { _id: exit.employee, status: 'Active' },
      { $set: { status: 'Inactive' } }
    );
    deactivated += result.modifiedCount;
    exit.deactivatedAt = new Date();
    await exit.save();
  }
  if (deactivated) console.log(`👋 Deactivated ${deactivated} employee(s) past their last working day.`);
  return deactivated;
};

let timer = null;

const startExitScheduler = () => {
  if (timer) return;
  const run = () =>
    processDueExits().catch((err) => console.error(`Exit scheduler failed: ${err.message}`));
  run();
  timer = setInterval(run, CHECK_EVERY_MS);
  timer.unref();
};

module.exports = { processDueExits, startExitScheduler };
