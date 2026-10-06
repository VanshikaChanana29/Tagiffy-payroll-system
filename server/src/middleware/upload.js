const path = require('path');
const multer = require('multer');

// Uploads are held in memory, checked, then written to file storage (R2 in
// production, local disk in dev) by the controller — see utils/fileStorage.js.
// Folder names inside that storage:
const DOCUMENTS_FOLDER = 'documents';
const AVATARS_FOLDER = 'avatars';
const RECEIPTS_FOLDER = 'receipts';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Never trust the uploaded filename — the stored name is always our own.
const uniqueSuffix = (range = 1e9) => `${Date.now()}-${Math.round(Math.random() * range)}`;

// PDFs only: check the declared MIME type and the extension.
const fileFilter = (req, file, cb) => {
  const isPdfMime = file.mimetype === 'application/pdf';
  const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';

  if (!isPdfMime || !isPdfExt) {
    return cb(new Error('Only PDF files are accepted. Please upload a .pdf document.'));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

// Turn multer's errors into the same JSON shape the rest of the API returns.
const uploadDocument = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large. Maximum allowed size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`
          : err.message || 'File upload failed';
      return res.status(400).json({ success: false, message });
    }
    if (req.file) req.file.filename = `${req.params.id}-${uniqueSuffix()}.pdf`;
    next();
  });
};


// --- Profile photos -------------------------------------------------------

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const avatarFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    return cb(new Error('Please choose a JPG, PNG, or WEBP image.'));
  }
  cb(null, true);
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: avatarFilter,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
});

const uploadAvatar = (req, res, next) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Image is too large. Maximum allowed size is ${MAX_AVATAR_BYTES / (1024 * 1024)} MB.`
          : err.message || 'Photo upload failed';
      return res.status(400).json({ success: false, message });
    }
    if (req.file) {
      const ext = ALLOWED_IMAGE_TYPES[req.file.mimetype] || '.jpg';
      // Long random suffix: these are served without auth, so the path must not be guessable.
      req.file.filename = `${req.params.id}-${uniqueSuffix(1e12)}${ext}`;
    }
    next();
  });
};

// Magic bytes for the image formats we accept, so a renamed file is rejected.
const isRealImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const head = buffer.subarray(0, 12);

  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp =
      head.subarray(0, 4).toString('latin1') === 'RIFF' &&
      head.subarray(8, 12).toString('latin1') === 'WEBP';

  return isJpg || isPng || isWebp;
};

// Human-readable size for the UI, derived from the real file — never typed by hand.
const formatFileSize = (bytes) => {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// The browser derives the MIME type from the file extension, so renaming
// invoice.txt to invoice.pdf passes that check. Every real PDF starts with the
// bytes "%PDF-", so verify the content itself before accepting the file.
const isRealPdf = (buffer) =>
  Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

// --- Bulk employee sheet (Excel/CSV) --------------------------------------

// The sheet is parsed in memory and never written to disk — it only ever
// produces User documents, so there is nothing worth keeping as a file.
const MAX_SHEET_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_SHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const sheetFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_SHEET_EXTENSIONS.includes(ext)) {
    return cb(new Error('Please upload a .xlsx, .xls, or .csv file.'));
  }
  cb(null, true);
};

const sheetUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: sheetFilter,
  limits: { fileSize: MAX_SHEET_BYTES, files: 1 },
});

const uploadEmployeeSheet = (req, res, next) => {
  sheetUpload.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large. Maximum allowed size is ${MAX_SHEET_BYTES / (1024 * 1024)} MB.`
          : err.message || 'File upload failed';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};

// --- Reimbursement receipts (PDF or photo of a bill) ----------------------

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_RECEIPT_TYPES = { ...ALLOWED_IMAGE_TYPES, 'application/pdf': '.pdf' };

const receiptFilter = (req, file, cb) => {
  if (!ALLOWED_RECEIPT_TYPES[file.mimetype]) {
    return cb(new Error('Please upload a PDF, JPG, PNG, or WEBP receipt.'));
  }
  cb(null, true);
};

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: receiptFilter,
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
});

// Receipt is optional, so a request with no file attached is not an error.
const uploadReceipt = (req, res, next) => {
  receiptUpload.single('receipt')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large. Maximum allowed size is ${MAX_RECEIPT_BYTES / (1024 * 1024)} MB.`
          : err.message || 'Receipt upload failed';
      return res.status(400).json({ success: false, message });
    }
    if (req.file) {
      // No owning record exists yet at upload time (it's created in the same
      // request), so the name is just a unique token, not keyed to an id.
      const ext = ALLOWED_RECEIPT_TYPES[req.file.mimetype] || path.extname(req.file.originalname) || '.bin';
      req.file.filename = `receipt-${uniqueSuffix()}${ext}`;
    }
    next();
  });
};

module.exports = {
  uploadDocument,
  DOCUMENTS_FOLDER,
  MAX_FILE_BYTES,
  formatFileSize,
  isRealPdf,
  uploadAvatar,
  AVATARS_FOLDER,
  MAX_AVATAR_BYTES,
  isRealImage,
  uploadEmployeeSheet,
  MAX_SHEET_BYTES,
  uploadReceipt,
  RECEIPTS_FOLDER,
};
