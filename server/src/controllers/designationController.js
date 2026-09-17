const Designation = require('../models/Designation');
const User = require('../models/User');

// @desc    List all designations
// @route   GET /api/designations
// @access  Private (any authenticated user)
const getAllDesignations = async (req, res) => {
  try {
    const designations = await Designation.find()
      .populate('department', 'name')
      .sort({ title: 1 });

    res.status(200).json({ success: true, count: designations.length, designations });
  } catch (error) {
    console.error('Get Designations Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve designations',
      error: error.message,
    });
  }
};

// @desc    Create a designation
// @route   POST /api/designations
// @access  Private (Admin only)
const createDesignation = async (req, res) => {
  try {
    const { title, department, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Designation title is required' });
    }

    const existing = await Designation.findOne({ title: new RegExp(`^${title.trim()}$`, 'i') });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Designation '${title}' already exists`,
      });
    }

    const designation = await Designation.create({
      title: title.trim(),
      department: department || null,
      description: description || '',
    });

    res.status(201).json({
      success: true,
      message: `Designation '${designation.title}' created successfully`,
      designation,
    });
  } catch (error) {
    console.error('Create Designation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create designation',
      error: error.message,
    });
  }
};

// @desc    Update a designation
// @route   PUT /api/designations/:id
// @access  Private (Admin only)
const updateDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, department, description } = req.body;

    const designation = await Designation.findById(id);
    if (!designation) {
      return res.status(404).json({ success: false, message: 'Designation not found' });
    }

    if (title && title.trim() && title.trim() !== designation.title) {
      const duplicate = await Designation.findOne({
        _id: { $ne: id },
        title: new RegExp(`^${title.trim()}$`, 'i'),
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Designation '${title}' already exists`,
        });
      }
      designation.title = title.trim();
    }

    if (department !== undefined) designation.department = department || null;
    if (description !== undefined) designation.description = description;

    await designation.save();

    res.status(200).json({
      success: true,
      message: 'Designation updated successfully',
      designation,
    });
  } catch (error) {
    console.error('Update Designation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update designation',
      error: error.message,
    });
  }
};

// @desc    Delete a designation
// @route   DELETE /api/designations/:id
// @access  Private (Admin only)
const deleteDesignation = async (req, res) => {
  try {
    const { id } = req.params;

    const designation = await Designation.findById(id);
    if (!designation) {
      return res.status(404).json({ success: false, message: 'Designation not found' });
    }

    const employeeCount = await User.countDocuments({ designation: designation.title });
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete '${designation.title}' — ${employeeCount} employee(s) still hold this designation. Reassign them first.`,
      });
    }

    await designation.deleteOne();

    res.status(200).json({
      success: true,
      message: `Designation '${designation.title}' deleted successfully`,
    });
  } catch (error) {
    console.error('Delete Designation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete designation',
      error: error.message,
    });
  }
};

module.exports = {
  getAllDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
