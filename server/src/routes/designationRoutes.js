const express = require('express');
const router = express.Router();
const {
  getAllDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
} = require('../controllers/designationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getAllDesignations)
  .post(authorize('admin'), createDesignation);

router.route('/:id')
  .put(authorize('admin'), updateDesignation)
  .delete(authorize('admin'), deleteDesignation);

module.exports = router;
