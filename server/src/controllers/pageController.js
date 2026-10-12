const Page = require('../models/Page');
const User = require('../models/User');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    List all pages, each with the employees assigned to it
// @route   GET /api/pages
// @access  Private (any authenticated user)
const getAllPages = async (req, res) => {
  try {
    const [pages, assigned] = await Promise.all([
      Page.find().sort({ name: 1 }).lean(),
      User.find({ pages: { $exists: true, $ne: [] } })
        .select('name employeeId designation avatar pages')
        .sort({ name: 1 })
        .lean(),
    ]);

    const byPage = new Map(pages.map((p) => [p._id.toString(), []]));
    assigned.forEach((u) => {
      (u.pages || []).forEach((pageId) => {
        const list = byPage.get(pageId.toString());
        if (list) list.push({ _id: u._id, name: u.name, employeeId: u.employeeId, designation: u.designation, avatar: u.avatar });
      });
    });

    const withEmployees = pages.map((p) => ({ ...p, employees: byPage.get(p._id.toString()) }));

    res.status(200).json({ success: true, count: pages.length, pages: withEmployees });
  } catch (error) {
    console.error('Get Pages Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pages',
      error: error.message,
    });
  }
};

// @desc    Create a page
// @route   POST /api/pages
// @access  Private (Admin only)
const createPage = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Page name is required' });
    }

    const existing = await Page.findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Page '${name.trim()}' already exists`,
      });
    }

    const page = await Page.create({
      name: name.trim(),
      description: description || '',
    });

    res.status(201).json({
      success: true,
      message: `Page '${page.name}' created successfully`,
      page,
    });
  } catch (error) {
    console.error('Create Page Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create page',
      error: error.message,
    });
  }
};

// @desc    Update a page
// @route   PUT /api/pages/:id
// @access  Private (Admin only)
const updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const page = await Page.findById(id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    if (name && name.trim() && name.trim() !== page.name) {
      const duplicate = await Page.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i'),
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Page '${name.trim()}' already exists`,
        });
      }
      page.name = name.trim();
    }

    if (description !== undefined) page.description = description;

    await page.save();

    res.status(200).json({
      success: true,
      message: 'Page updated successfully',
      page,
    });
  } catch (error) {
    console.error('Update Page Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update page',
      error: error.message,
    });
  }
};

// @desc    Delete a page and unassign it from every employee
// @route   DELETE /api/pages/:id
// @access  Private (Admin only)
const deletePage = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await Page.findById(id);
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    const { modifiedCount } = await User.updateMany({ pages: page._id }, { $pull: { pages: page._id } });
    await page.deleteOne();

    res.status(200).json({
      success: true,
      message: modifiedCount
        ? `Page '${page.name}' deleted and removed from ${modifiedCount} employee(s)`
        : `Page '${page.name}' deleted successfully`,
    });
  } catch (error) {
    console.error('Delete Page Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete page',
      error: error.message,
    });
  }
};

module.exports = {
  getAllPages,
  createPage,
  updatePage,
  deletePage,
};
