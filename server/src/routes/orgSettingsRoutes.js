const express = require('express');
const router = express.Router();
const { getOrgSettings, updateOrgSettings } = require('../controllers/orgSettingsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getOrgSettings)
  .put(authorize('admin'), updateOrgSettings);

module.exports = router;
