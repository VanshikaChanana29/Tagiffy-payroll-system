const express = require('express');
const router = express.Router();
const {
  getAllEmployees,
  getMyTeam,
  getEligibleManagers,
  getEmployeeById,
  getTodaysBirthdays,
  createEmployee,
  downloadEmployeeTemplate,
  bulkUploadEmployees,
  updateEmployee,
  deleteEmployee,
  getUserDocuments,
  addUserDocument,
  deleteUserDocument,
  downloadUserDocument,
  verifyUserDocument,
  getUserAssets,
  addUserAsset,
  updateUserAsset,
  deleteUserAsset,
  uploadUserAvatar,
  resetUserAvatar,
  previewSalaryBreakup,
  updateEmployeeSalary,
  clearAllData,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { uploadDocument, uploadAvatar, uploadEmployeeSheet } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

router.delete('/purge-database', authorize('admin'), clearAllData);

router.get('/my-team', authorize('admin', 'manager'), getMyTeam);
router.get('/birthdays/today', getTodaysBirthdays);

router.route('/')
  .get(authorize('admin', 'manager'), getAllEmployees)
  .post(authorize('admin'), createEmployee);

router.get('/managers', authorize('admin'), getEligibleManagers);
router.get('/salary-preview', authorize('admin'), previewSalaryBreakup);

router.get('/bulk-upload/template', authorize('admin'), downloadEmployeeTemplate);
router.post('/bulk-upload', authorize('admin'), uploadEmployeeSheet, bulkUploadEmployees);

// Shortcut for user updating own profile
router.put('/profile', (req, res) => {
  req.params.id = req.user._id.toString();
  return updateEmployee(req, res);
});

// Employee document routes
router.route('/:id/documents')
  .get(getUserDocuments)
  .post(uploadDocument, addUserDocument);

router.put('/:id/salary', authorize('admin'), updateEmployeeSalary);

router.get('/:id/documents/:docId/download', downloadUserDocument);

// Profile photo: upload a real image, or fall back to generated initials
router.route('/:id/avatar')
  .post(uploadAvatar, uploadUserAvatar)
  .delete(resetUserAvatar);
router.delete('/:id/documents/:docId', deleteUserDocument);
router.put('/:id/documents/:docId/status', authorize('admin'), verifyUserDocument);

// Employee asset routes (laptop, phone, etc — HR can assign to anyone, employee can manage their own)
router.route('/:id/assets')
  .get(getUserAssets)
  .post(addUserAsset);
router.route('/:id/assets/:assetId')
  .put(updateUserAsset)
  .delete(deleteUserAsset);

router.route('/:id')
  .get(getEmployeeById)
  .put(updateEmployee)
  .delete(authorize('admin'), deleteEmployee);

module.exports = router;
