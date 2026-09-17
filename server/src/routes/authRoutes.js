const express = require('express');
const router = express.Router();
const { register, verifyEmail, login, getMe, logout, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/signup', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/change-password', protect, changePassword);

module.exports = router;
