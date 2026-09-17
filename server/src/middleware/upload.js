const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Real files live on disk, outside the database, in a folder the API owns.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads/documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never trust the uploaded filename on disk — generate our own.
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${req.params.id}-${unique}.pdf`);
  },
});

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
  storage,
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
    next();
  });
};


// --- Profile photos -------------------------------------------------------

const AVATAR_DIR = process.env.AVATAR_DIR || path.resolve(__dirname, '../../uploads/avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || '.jpg';
    // Long random suffix: these are served without auth, so the path must not be guessable.
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e12)}`;
    cb(null, `${req.params.id}-${unique}${ext}`);
  },
});

const avatarFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    return cb(new Error('Please choose a JPG, PNG, or WEBP image.'));
  }
  cb(null, true);
};

const avatarUpload = multer({
  storage: avatarStorage,
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
    next();
  });
};

// Magic bytes for the image formats we accept, so a renamed file is rejected.
const isRealImage = (absolutePath) => {
  let fd;
  try {
    fd = fs.openSync(absolutePath, 'r');
    const head = Buffer.alloc(12);
    const read = fs.readSync(fd, head, 0, 12, 0);
    if (read < 12) return false;

    const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp =
      head.subarray(0, 4).toString('latin1') === 'RIFF' &&
      head.subarray(8, 12).toString('latin1') === 'WEBP';

    return isJpg || isPng || isWebp;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
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
const isRealPdf = (absolutePath) => {
  let fd;
  try {
    fd = fs.openSync(absolutePath, 'r');
    const header = Buffer.alloc(5);
    const bytesRead = fs.readSync(fd, header, 0, 5, 0);
    return bytesRead === 5 && header.toString('latin1') === '%PDF-';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

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

module.exports = {
  uploadDocument,
  UPLOAD_DIR,
  MAX_FILE_BYTES,
  formatFileSize,
  isRealPdf,
  uploadAvatar,
  AVATAR_DIR,
  MAX_AVATAR_BYTES,
  isRealImage,
  uploadEmployeeSheet,
  MAX_SHEET_BYTES,
};
