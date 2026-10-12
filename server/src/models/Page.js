const mongoose = require('mongoose');

// A content page the company runs (e.g. DESH, Hindustan). Creators are
// assigned to pages from their profile; one person can work on several pages
// and one page can have several creators (User.pages).
const pageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Page name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Page', pageSchema);
