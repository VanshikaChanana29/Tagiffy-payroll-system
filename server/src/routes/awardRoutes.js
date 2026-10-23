const express = require('express');
const router = express.Router();
const {
  getAwards,
  getMyAwards,
  createAward,
  resendCertificate,
  deleteAward,
  downloadCertificate,
  getCertificateImages,
  getCertificateImage,
  uploadCertificateImage,
  deleteCertificateImage,
  previewCertificate,
} = require('../controllers/awardController');
const { protect, authorize } = require('../middleware/auth');
const { uploadCertificateImage: receiveImage } = require('../middleware/upload');

router.use(protect);

// Signatures and stamp drawn on every certificate — HR only.
router.get('/certificate-images', authorize('admin'), getCertificateImages);
router.route('/certificate-images/:key')
  .get(authorize('admin'), getCertificateImage)
  .put(authorize('admin'), receiveImage, uploadCertificateImage)
  .delete(authorize('admin'), deleteCertificateImage);
router.get('/certificate-preview', authorize('admin'), previewCertificate);

// Everyone sees the winners; only HR names them.
router.route('/')
  .get(getAwards)
  .post(authorize('admin'), createAward);

router.get('/mine', getMyAwards);
router.get('/:id/certificate', downloadCertificate);
router.post('/:id/send-certificate', authorize('admin'), resendCertificate);
router.delete('/:id', authorize('admin'), deleteAward);

module.exports = router;
