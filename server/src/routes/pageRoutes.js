const express = require('express');
const router = express.Router();
const {
  getAllPages,
  createPage,
  updatePage,
  deletePage,
} = require('../controllers/pageController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getAllPages)
  .post(authorize('admin'), createPage);

router.route('/:id')
  .put(authorize('admin'), updatePage)
  .delete(authorize('admin'), deletePage);

module.exports = router;
