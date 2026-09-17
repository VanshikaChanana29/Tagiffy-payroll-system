const Department = require('../models/Department');
const User = require('../models/User');

// @desc    List all departments
// @route   GET /api/departments
// @access  Private (any authenticated user)
const getAllDepartments = async (req, res) => {
  try {
    const departments = await Department.find()
      .populate('headId', 'name email employeeId')
      .sort({ name: 1 });

    res.status(200).json({ success: true, count: departments.length, departments });
  } catch (error) {
    console.error('Get Departments Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve departments',
      error: error.message,
    });
  }
};

// @desc    Create a department
// @route   POST /api/departments
// @access  Private (Admin only)
const createDepartment = async (req, res) => {
  try {
    const { name, code, description, headId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    const existing = await Department.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Department '${name}' already exists`,
      });
    }

    const department = await Department.create({
      name: name.trim(),
      code: code ? code.trim() : '',
      description: description || '',
      headId: headId || null,
    });

    res.status(201).json({
      success: true,
      message: `Department '${department.name}' created successfully`,
      department,
    });
  } catch (error) {
    console.error('Create Department Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create department',
      error: error.message,
    });
  }
};

// @desc    Update a department
// @route   PUT /api/departments/:id
// @access  Private (Admin only)
const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, headId } = req.body;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    if (name && name.trim() && name.trim() !== department.name) {
      const duplicate = await Department.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${name.trim()}$`, 'i'),
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Department '${name}' already exists`,
        });
      }
      department.name = name.trim();
    }

    if (code !== undefined) department.code = code.trim();
    if (description !== undefined) department.description = description;
    if (headId !== undefined) department.headId = headId || null;

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      department,
    });
  } catch (error) {
    console.error('Update Department Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department',
      error: error.message,
    });
  }
};

// @desc    Delete a department
// @route   DELETE /api/departments/:id
// @access  Private (Admin only)
const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const employeeCount = await User.countDocuments({ department: department.name });
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete '${department.name}' — ${employeeCount} employee(s) are still assigned to it. Reassign them first.`,
      });
    }

    await department.deleteOne();

    res.status(200).json({
      success: true,
      message: `Department '${department.name}' deleted successfully`,
    });
  } catch (error) {
    console.error('Delete Department Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete department',
      error: error.message,
    });
  }
};

module.exports = {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
