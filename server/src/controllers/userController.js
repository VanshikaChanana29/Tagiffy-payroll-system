const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const {
  UPLOAD_DIR,
  formatFileSize,
  isRealPdf,
  AVATAR_DIR,
  isRealImage,
} = require('../middleware/upload');
const { buildInitialsAvatar } = require('../utils/initialsAvatar');
const OrgSettings = require('../models/OrgSettings');
const { buildSalaryBreakup } = require('../utils/salaryStructure');
const { getVisibleUserIds, getDirectReports } = require('../utils/teamScope');
const { parseEmployeeSheet, buildEmployeeTemplateWorkbook } = require('../utils/bulkEmployeeImport');
const { isAdminRole, isSuperAdmin } = require('../utils/roles');
const { notify, getHrAndOwnerIds } = require('../utils/notificationService');

// Documents belong to the employee or to HR — nobody else, ever.
const canAccessDocuments = (req, employeeId) =>
  req.user._id.toString() === employeeId || isAdminRole(req.user.role);

// Assets follow the same rule: the employee they're assigned to, or HR.
const canAccessAssets = canAccessDocuments;

// Remove the file backing a document, ignoring a file that is already gone.
const removeStoredFile = (storedName) => {
  if (!storedName) return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, storedName));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Failed to remove stored file ${storedName}: ${err.message}`);
    }
  }
};

// Validate that department/designation reference existing master data records.
// Returns an error message string if invalid, or null if valid/not provided.
const validateDeptDesignation = async (department, designation) => {
  if (department) {
    const dept = await Department.findOne({ name: new RegExp(`^${department.trim()}$`, 'i') });
    if (!dept) {
      return `Department '${department}' does not exist. Please create it first in Org Settings.`;
    }
  }
  if (designation) {
    const desig = await Designation.findOne({ title: new RegExp(`^${designation.trim()}$`, 'i') });
    if (!desig) {
      return `Designation '${designation}' does not exist. Please create it first in Org Settings.`;
    }
  }
  return null;
};

// @desc    Get all employees with search, filter, and pagination
// @route   GET /api/users
// @access  Private (Admin only)
const getAllEmployees = async (req, res) => {
  try {
    const { search, department, status, role } = req.query;

    const query = {};

    // Filter by department
    if (department && department !== 'All') {
      query.department = department;
    }

    // Filter by status
    if (status && status !== 'All') {
      query.status = status;
    }

    // Filter by role
    if (role && role !== 'All') {
      query.role = role;
    }

    // Search by name, email, employeeId, or designation
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { employeeId: searchRegex },
        { designation: searchRegex },
        { department: searchRegex },
      ];
    }

    // A manager's directory is their own team.
    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds !== null) {
      query._id = { $in: visibleIds };
    }

    const employees = await User.find(query)
      .select('-password')
      .populate('reportingManager', 'name employeeId email')
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    // Extract unique departments for filter dropdown
    const departments = await User.distinct('department');

    res.status(200).json({
      success: true,
      count: employees.length,
      total,
      departments,
      employees,
    });
  } catch (error) {
    console.error('Get All Employees Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve employee directory',
      error: error.message,
    });
  }
};

// @desc    List employees eligible to be a reporting manager (admins & managers)
// @route   GET /api/users/managers
// @access  Private (Admin only)
const getEligibleManagers = async (req, res) => {
  try {
    const managers = await User.find({
      role: { $in: ['super_admin', 'admin', 'manager'] },
      status: 'Active',
    })
      .select('name employeeId email role designation')
      .sort({ name: 1 });

    res.status(200).json({ success: true, managers });
  } catch (error) {
    console.error('Get Eligible Managers Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve eligible managers',
      error: error.message,
    });
  }
};

// @desc    The people reporting to the signed-in manager
// @route   GET /api/users/my-team
// @access  Private (Manager or Admin)
const getMyTeam = async (req, res) => {
  try {
    const team = await getDirectReports(req.user._id);
    res.status(200).json({
      success: true,
      count: team.length,
      team,
    });
  } catch (error) {
    console.error('Get My Team Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your team',
      error: error.message,
    });
  }
};

// @desc    Get single employee details
// @route   GET /api/users/:id
// @access  Private (Admin or Self)
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    // Non-admins can only view their own profile or public team info
    if (!isAdminRole(req.user.role) && req.user._id.toString() !== id) {
      // Allow viewing basic profile of colleagues
      const colleague = await User.findById(id).select(
        'name email employeeId department designation avatar status'
      );
      if (!colleague) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      return res.status(200).json({ success: true, employee: colleague });
    }

    const employee = await User.findById(id)
      .select('-password')
      .populate('reportingManager', 'name employeeId email');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      employee,
    });
  } catch (error) {
    console.error('Get Employee By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee details',
      error: error.message,
    });
  }
};

// @desc    Employees whose birthday is today, org-wide
// @route   GET /api/users/birthdays/today
// @access  Private (everyone — this is a team morale feature, not HR data)
const getTodaysBirthdays = async (req, res) => {
  try {
    const employees = await User.find({
      status: 'Active',
      dateOfBirth: { $ne: null },
    }).select('name employeeId department designation avatar dateOfBirth');

    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const birthdays = employees.filter((emp) => {
      const dob = new Date(emp.dateOfBirth);
      return dob.getMonth() === todayMonth && dob.getDate() === todayDate;
    });

    res.status(200).json({
      success: true,
      birthdays: birthdays.map((emp) => ({
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        designation: emp.designation,
        avatar: emp.avatar,
      })),
    });
  } catch (error) {
    console.error('Get Todays Birthdays Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch birthdays',
      error: error.message,
    });
  }
};

// @desc    Create/Onboard a new employee
// @route   POST /api/users
// @access  Private (Admin only)
const createEmployee = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'employee',
      department,
      designation,
      reportingManager,
      phone,
      joiningDate,
      dateOfBirth,
      avatar,
      address,
      emergencyContact,
      leaveBalance,
    } = req.body;

    if (!name || !email || !department || !designation) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, department, and designation',
      });
    }

    // Only a super admin may hand out admin-level access; HR admins can
    // onboard everyone else but not create peers who could manage them.
    if (isAdminRole(role) && !isSuperAdmin(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can create admin accounts.',
      });
    }

    const deptDesigError = await validateDeptDesignation(department, designation);
    if (deptDesigError) {
      return res.status(400).json({ success: false, message: deptDesigError });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An employee with this email address already exists',
      });
    }

    // Generate unique employee ID if not provided (e.g. EMP-007)
    let employeeId = req.body.employeeId;
    if (!employeeId) {
      let num = (await User.countDocuments()) + 1;
      while (await User.findOne({ employeeId: `EMP-${String(num).padStart(3, '0')}` })) {
        num++;
      }
      employeeId = `EMP-${String(num).padStart(3, '0')}`;
    }

    // Default password if none provided
    const userPassword = password || 'employee123';

    const newEmployee = new User({
      employeeId,
      name,
      email: email.toLowerCase().trim(),
      password: userPassword,
      role: role || 'employee',
      department,
      designation,
      reportingManager: reportingManager || null,
      phone: phone || '',
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      avatar: avatar || buildInitialsAvatar(name, email),
      status: 'Active',
      isVerified: true,
      documents: [
        {
          name: `${name.replace(/\s+/g, '_')}_Appointment_Letter.pdf`,
          type: 'Offer Letter',
          fileSize: '1.2 MB',
          status: 'Verified',
          uploadedAt: new Date(),
        },
      ],
      address: address || {},
      emergencyContact: emergencyContact || {},
      leaveBalance: leaveBalance || { paid: 14, sick: 7, unpaid: 0 },
    });

    // A new hire is payroll-ready the moment they are created, instead of
    // waiting for someone to type a payslip by hand at month end.
    if (req.body.annualCtc) {
      const breakup = buildSalaryBreakup(Number(req.body.annualCtc));
      delete breakup.totalDeductions;
      delete breakup.netMonthly;
      newEmployee.salary = {
        ...breakup,
        isCustom: false,
        effectiveFrom: newEmployee.joiningDate || new Date(),
      };
    }

    await newEmployee.save();

    res.status(201).json({
      success: true,
      message: `Employee ${newEmployee.name} onboarded successfully with ID ${newEmployee.employeeId}`,
      employee: newEmployee,
    });
  } catch (error) {
    console.error('Create Employee Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create new employee',
      error: error.message,
    });
  }
};

// @desc    Download a fillable .xlsx template for bulk employee onboarding
// @route   GET /api/users/bulk-upload/template
// @access  Private (Admin only)
const downloadEmployeeTemplate = async (req, res) => {
  try {
    const buffer = buildEmployeeTemplateWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="employee_upload_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Download Employee Template Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate the template file',
      error: error.message,
    });
  }
};

// @desc    Bulk-onboard employees from an uploaded Excel/CSV sheet
// @route   POST /api/users/bulk-upload
// @access  Private (Admin only)
//
// Every row is validated and saved independently: a bad row is reported back
// with its sheet row number and skipped, it never aborts the rest of the batch.
const bulkUploadEmployees = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please choose an Excel (.xlsx/.xls) or .csv file to upload.',
      });
    }

    let parsed;
    try {
      parsed = parseEmployeeSheet(req.file.buffer);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Could not read that file. Please upload a valid .xlsx, .xls, or .csv file.',
      });
    }

    const { rows, unrecognizedHeaders } = parsed;
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No employee rows were found in that file.',
      });
    }

    // Prefetch reference data once instead of querying per row.
    const [departments, designations, existingUsers] = await Promise.all([
      Department.find().select('name'),
      Designation.find().select('title'),
      User.find().select('email employeeId'),
    ]);

    const departmentByLower = new Map(departments.map((d) => [d.name.toLowerCase(), d.name]));
    const designationByLower = new Map(designations.map((d) => [d.title.toLowerCase(), d.title]));
    const emailToUser = new Map(
      existingUsers.map((u) => [u.email.toLowerCase(), { _id: u._id }])
    );
    const usedEmployeeIds = new Set(existingUsers.map((u) => u.employeeId));
    const seenEmailsInFile = new Set();

    // Numeric part of existing EMP-### ids, so newly generated ids continue
    // the sequence instead of colliding with what's already there.
    let nextEmployeeIdNum =
      existingUsers.reduce((max, u) => {
        const match = /^EMP-(\d+)$/i.exec(u.employeeId || '');
        return match ? Math.max(max, parseInt(match[1], 10)) : max;
      }, 0) + 1;

    const allocateEmployeeId = () => {
      let candidate;
      do {
        candidate = `EMP-${String(nextEmployeeIdNum).padStart(3, '0')}`;
        nextEmployeeIdNum++;
      } while (usedEmployeeIds.has(candidate));
      usedEmployeeIds.add(candidate);
      return candidate;
    };

    const created = [];
    const failed = [];
    const VALID_ROLES = ['admin', 'manager', 'employee'];

    for (const { rowNumber, data } of rows) {
      const name = (data.name || '').toString().trim();
      const email = (data.email || '').toString().trim().toLowerCase();
      // Department and Designation aren't collected via bulk upload — HR
      // assigns them manually afterwards, so new rows fall back to the
      // schema defaults ('General' / 'Team Member') unless a legacy sheet
      // still carries these columns.
      const department = (data.department || '').toString().trim();
      const designation = (data.designation || '').toString().trim();

      const fail = (message) => failed.push({ row: rowNumber, name, email, reason: message });

      if (!name && !email) continue; // fully blank row

      if (!name || !email) {
        fail('Name and Email are required.');
        continue;
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        fail(`'${email}' is not a valid email address.`);
        continue;
      }

      if (seenEmailsInFile.has(email)) {
        fail(`Duplicate email '${email}' appears more than once in this file.`);
        continue;
      }
      if (emailToUser.has(email)) {
        fail(`An employee with email '${email}' already exists.`);
        continue;
      }

      let canonicalDept;
      if (department) {
        canonicalDept = departmentByLower.get(department.toLowerCase());
        if (!canonicalDept) {
          fail(`Department '${department}' does not exist. Please create it first in Org Settings.`);
          continue;
        }
      }
      let canonicalDesig;
      if (designation) {
        canonicalDesig = designationByLower.get(designation.toLowerCase());
        if (!canonicalDesig) {
          fail(`Designation '${designation}' does not exist. Please create it first in Org Settings.`);
          continue;
        }
      }

      let role = (data.role || 'employee').toString().trim().toLowerCase();
      if (!VALID_ROLES.includes(role)) {
        fail(`Role '${data.role}' is invalid. Use admin, manager, or employee.`);
        continue;
      }
      if (isAdminRole(role) && !isSuperAdmin(req.user.role)) {
        fail('Only a super admin can bulk-create admin accounts.');
        continue;
      }

      let reportingManager = null;
      const managerEmail = (data.reportingManagerEmail || '').toString().trim().toLowerCase();
      if (managerEmail) {
        const manager = emailToUser.get(managerEmail);
        if (!manager) {
          fail(`Reporting manager email '${managerEmail}' does not match any existing employee.`);
          continue;
        }
        reportingManager = manager._id;
      }

      const joiningDate = data.joiningDate ? new Date(data.joiningDate) : new Date();
      if (Number.isNaN(joiningDate.getTime())) {
        fail(`Joining date '${data.joiningDate}' is not a valid date.`);
        continue;
      }

      // Emp.code from the sheet wins over an auto-generated id, so uploads
      // that already carry a company employee code keep it.
      const sheetEmployeeId = (data.employeeId || '').toString().trim().toUpperCase();
      let employeeId;
      if (sheetEmployeeId) {
        if (usedEmployeeIds.has(sheetEmployeeId)) {
          fail(`Employee code '${sheetEmployeeId}' already exists or is duplicated in this file.`);
          continue;
        }
        employeeId = sheetEmployeeId;
        usedEmployeeIds.add(employeeId);
      } else {
        employeeId = allocateEmployeeId();
      }
      const password = (data.password || '').toString().trim() || 'employee123';

      try {
        const newEmployee = new User({
          employeeId,
          name,
          email,
          password,
          role,
          ...(canonicalDept && { department: canonicalDept }),
          ...(canonicalDesig && { designation: canonicalDesig }),
          reportingManager,
          phone: (data.phone || '').toString().trim(),
          joiningDate,
          avatar: buildInitialsAvatar(name, email),
          status: 'Active',
          isVerified: true,
          leaveBalance: { paid: 14, sick: 7, unpaid: 0 },
          bankDetails: {
            accountNumber: (data.accountNumber || '').toString().trim(),
            ifscCode: (data.ifscCode || '').toString().trim().toUpperCase(),
            bankName: (data.bankName || '').toString().trim(),
          },
        });

        const annualCtc = Number(data.annualCtc);
        if (annualCtc > 0) {
          const breakup = buildSalaryBreakup(annualCtc);
          delete breakup.totalDeductions;
          delete breakup.netMonthly;
          newEmployee.salary = { ...breakup, isCustom: false, effectiveFrom: joiningDate };
        }

        await newEmployee.save();

        emailToUser.set(email, { _id: newEmployee._id });
        seenEmailsInFile.add(email);
        created.push({ row: rowNumber, name, email, employeeId });
      } catch (err) {
        fail(err.message || 'Failed to create this employee.');
      }
    }

    res.status(200).json({
      success: true,
      message: `${created.length} of ${rows.length} employee row(s) onboarded successfully.`,
      totalRows: rows.length,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
      unrecognizedHeaders,
    });
  } catch (error) {
    console.error('Bulk Upload Employees Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process the uploaded file',
      error: error.message,
    });
  }
};

// @desc    Update employee profile
// @route   PUT /api/users/:id
// @access  Private (Admin for all fields, Employee for personal info)
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.user._id.toString() === id;
    const isAdmin = isAdminRole(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this profile',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Fields employee is allowed to edit for themselves
    if (isSelf && !isAdmin) {
      const { phone, address, emergencyContact, avatar, dateOfBirth } = req.body;
      if (phone !== undefined) employee.phone = phone;
      if (avatar !== undefined) employee.avatar = avatar;
      if (dateOfBirth !== undefined) employee.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (address) employee.address = { ...employee.address, ...address };
      if (emergencyContact)
        employee.emergencyContact = { ...employee.emergencyContact, ...emergencyContact };
    }

    // Admin can update everything, except another admin's account — that's
    // reserved for a super admin, so HR admins can't manage their peers.
    if (isAdmin) {
      if (isAdminRole(employee.role) && !isSelf && !isSuperAdmin(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only a super admin can manage another admin account.',
        });
      }

      const {
        name,
        email,
        role,
        department,
        designation,
        reportingManager,
        phone,
        status,
        avatar,
        address,
        emergencyContact,
        leaveBalance,
        joiningDate,
        dateOfBirth,
      } = req.body;

      if (department || designation) {
        const deptDesigError = await validateDeptDesignation(department, designation);
        if (deptDesigError) {
          return res.status(400).json({ success: false, message: deptDesigError });
        }
      }

      if (reportingManager !== undefined && reportingManager === id) {
        return res.status(400).json({
          success: false,
          message: 'An employee cannot report to themselves',
        });
      }

      if (role && role !== employee.role) {
        if (isAdminRole(role) && !isSuperAdmin(req.user.role)) {
          return res.status(403).json({
            success: false,
            message: 'Only a super admin can grant admin access.',
          });
        }
        employee.role = role;
      }

      if (name) employee.name = name;
      if (email) employee.email = email.toLowerCase().trim();
      if (department) employee.department = department;
      if (designation) employee.designation = designation;
      if (reportingManager !== undefined) employee.reportingManager = reportingManager || null;
      if (phone !== undefined) employee.phone = phone;
      if (status) employee.status = status;
      if (avatar) employee.avatar = avatar;
      if (joiningDate) employee.joiningDate = new Date(joiningDate);
      if (dateOfBirth !== undefined) employee.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (address) employee.address = { ...employee.address, ...address };
      if (emergencyContact)
        employee.emergencyContact = { ...employee.emergencyContact, ...emergencyContact };
      if (leaveBalance)
        employee.leaveBalance = { ...employee.leaveBalance, ...leaveBalance };
    }

    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      employee,
    });
  } catch (error) {
    console.error('Update Employee Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update employee profile',
      error: error.message,
    });
  }
};

// @desc    Delete/Deactivate employee
// @route   DELETE /api/users/:id
// @access  Private (Admin only)
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot delete their own account',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (isAdminRole(employee.role) && !isSuperAdmin(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can deactivate an admin account.',
      });
    }

    // Soft delete / deactivate by default
    employee.status = 'Inactive';
    await employee.save();

    res.status(200).json({
      success: true,
      message: `Employee ${employee.name} deactivated successfully`,
    });
  } catch (error) {
    console.error('Delete Employee Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete employee',
      error: error.message,
    });
  }
};

// @desc    Get employee documents
// @route   GET /api/users/:id/documents
// @access  Private (Self or Admin)
const getUserDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.user._id.toString() === id;
    const isAdmin = isAdminRole(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only view your own documents.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      documents: employee.documents || [],
    });
  } catch (error) {
    console.error('Get Documents Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve documents',
      error: error.message,
    });
  }
};

// @desc    Upload an employee document (PDF file)
// @route   POST /api/users/:id/documents
// @access  Private (Self or Admin)
const addUserDocument = async (req, res) => {
  try {
    const { id } = req.params;

    if (!canAccessDocuments(req, id)) {
      if (req.file) removeStoredFile(req.file.filename);
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only add documents to your own profile.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please choose a PDF file to upload.',
      });
    }

    const { name, type } = req.body;
    if (!type) {
      removeStoredFile(req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Please select a document type',
      });
    }

    // Confirm the bytes really are a PDF, not just a file named ".pdf".
    if (!isRealPdf(path.join(UPLOAD_DIR, req.file.filename))) {
      removeStoredFile(req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'That file is not a valid PDF. Please upload a real PDF document.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      removeStoredFile(req.file.filename);
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Every upload starts unverified, including HR's own, so that verification is
    // always a deliberate, recorded action rather than a side effect of uploading.
    const newDoc = {
      name: (name && name.trim()) || req.file.originalname,
      type: type.trim(),
      storedName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      fileSize: formatFileSize(req.file.size),
      status: 'Pending Verification',
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    };

    if (!employee.documents) employee.documents = [];
    employee.documents.push(newDoc);
    await employee.save();

    const savedDoc = employee.documents[employee.documents.length - 1];
    notify({
      recipients: await getHrAndOwnerIds(),
      type: 'document_uploaded',
      title: 'New document uploaded',
      message: `${employee.name} uploaded ${newDoc.name} (${newDoc.type}). Awaiting verification.`,
      relatedEntity: { kind: 'UserDocument', id: savedDoc._id },
    });

    res.status(201).json({
      success: true,
      message: `${newDoc.name} uploaded successfully (${newDoc.fileSize}). Awaiting HR verification.`,
      document: employee.documents[employee.documents.length - 1],
      documents: employee.documents,
    });
  } catch (error) {
    console.error('Add Document Error:', error);
    if (req.file) removeStoredFile(req.file.filename);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message,
    });
  }
};

// @desc    Download an employee document
// @route   GET /api/users/:id/documents/:docId/download
// @access  Private (Self or Admin)
const downloadUserDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    if (!canAccessDocuments(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only download your own documents.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const doc = (employee.documents || []).find((d) => d._id.toString() === docId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (!doc.storedName) {
      return res.status(404).json({
        success: false,
        message: 'This is a legacy record with no file attached. Please re-upload the document.',
      });
    }

    const filePath = path.join(UPLOAD_DIR, doc.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'The stored file is missing from the server.',
      });
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.download(filePath, doc.originalName || doc.name);
  } catch (error) {
    console.error('Download Document Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message,
    });
  }
};

// @desc    Delete employee document (and its stored file)
// @route   DELETE /api/users/:id/documents/:docId
// @access  Private (Self or Admin)
const deleteUserDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    if (!canAccessDocuments(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only manage your own documents.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const doc = (employee.documents || []).find((d) => d._id.toString() === docId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Drop the file too, so deleted documents do not linger on disk.
    removeStoredFile(doc.storedName);

    employee.documents = employee.documents.filter((d) => d._id.toString() !== docId);
    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
      documents: employee.documents,
    });
  } catch (error) {
    console.error('Delete Document Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message,
    });
  }
};

// @desc    Verify or reject a document (Admin only)
// @route   PUT /api/users/:id/documents/:docId/status
// @access  Private (Admin only)
const verifyUserDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { status, rejectionReason = '' } = req.body;

    if (!['Verified', 'Pending Verification', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document status',
      });
    }

    // A rejection the employee cannot act on is useless, so a reason is required.
    if (status === 'Rejected' && !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason so the employee knows what to correct.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const doc = (employee.documents || []).find((d) => d._id.toString() === docId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    doc.status = status;
    doc.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : '';

    // Record who made the call, so verification is auditable.
    if (status === 'Pending Verification') {
      doc.reviewedBy = null;
      doc.reviewedByName = '';
      doc.reviewedAt = null;
    } else {
      doc.reviewedBy = req.user._id;
      doc.reviewedByName = req.user.name;
      doc.reviewedAt = new Date();
    }

    await employee.save();

    if (status === 'Verified' || status === 'Rejected') {
      notify({
        recipients: [employee._id],
        type: status === 'Verified' ? 'document_verified' : 'document_rejected',
        title: `Document ${status.toLowerCase()}`,
        message:
          status === 'Verified'
            ? `Your document "${doc.name}" has been verified.`
            : `Your document "${doc.name}" was rejected: ${doc.rejectionReason}`,
        relatedEntity: { kind: 'UserDocument', id: doc._id },
      });
    }

    res.status(200).json({
      success: true,
      message: `Document marked as ${status} by ${req.user.name}`,
      document: doc,
      documents: employee.documents,
    });
  } catch (error) {
    console.error('Verify Document Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document status',
      error: error.message,
    });
  }
};

// @desc    Get employee assets
// @route   GET /api/users/:id/assets
// @access  Private (Self or Admin)
const getUserAssets = async (req, res) => {
  try {
    const { id } = req.params;

    if (!canAccessAssets(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only view your own assets.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      assets: employee.assets || [],
    });
  } catch (error) {
    console.error('Get Assets Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve assets',
      error: error.message,
    });
  }
};

// @desc    Assign an asset (laptop, phone, etc) to an employee
// @route   POST /api/users/:id/assets
// @access  Private (Self or Admin)
const addUserAsset = async (req, res) => {
  try {
    const { id } = req.params;

    if (!canAccessAssets(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only add assets to your own profile.',
      });
    }

    const { title, assetNumber, assetType } = req.body;
    if (!title?.trim() || !assetNumber?.trim() || !assetType?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the asset title, asset number, and asset type.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const newAsset = {
      title: title.trim(),
      assetNumber: assetNumber.trim(),
      assetType: assetType.trim(),
      assignedBy: req.user._id,
      assignedByName: req.user.name,
      createdAt: new Date(),
    };

    if (!employee.assets) employee.assets = [];
    employee.assets.push(newAsset);
    await employee.save();

    res.status(201).json({
      success: true,
      message: `${newAsset.title} added to ${employee.name}'s assets`,
      asset: employee.assets[employee.assets.length - 1],
      assets: employee.assets,
    });
  } catch (error) {
    console.error('Add Asset Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add asset',
      error: error.message,
    });
  }
};

// @desc    Update an employee asset
// @route   PUT /api/users/:id/assets/:assetId
// @access  Private (Self or Admin)
const updateUserAsset = async (req, res) => {
  try {
    const { id, assetId } = req.params;

    if (!canAccessAssets(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only manage your own assets.',
      });
    }

    const { title, assetNumber, assetType } = req.body;

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const asset = (employee.assets || []).find((a) => a._id.toString() === assetId);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ success: false, message: 'Asset title cannot be empty.' });
      }
      asset.title = title.trim();
    }
    if (assetNumber !== undefined) {
      if (!assetNumber.trim()) {
        return res.status(400).json({ success: false, message: 'Asset number cannot be empty.' });
      }
      asset.assetNumber = assetNumber.trim();
    }
    if (assetType !== undefined) {
      if (!assetType.trim()) {
        return res.status(400).json({ success: false, message: 'Asset type cannot be empty.' });
      }
      asset.assetType = assetType.trim();
    }
    asset.updatedBy = req.user._id;
    asset.updatedByName = req.user.name;
    asset.updatedAt = new Date();

    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      asset,
      assets: employee.assets,
    });
  } catch (error) {
    console.error('Update Asset Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update asset',
      error: error.message,
    });
  }
};

// @desc    Remove an employee asset
// @route   DELETE /api/users/:id/assets/:assetId
// @access  Private (Self or Admin)
const deleteUserAsset = async (req, res) => {
  try {
    const { id, assetId } = req.params;

    if (!canAccessAssets(req, id)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only manage your own assets.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const asset = (employee.assets || []).find((a) => a._id.toString() === assetId);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    employee.assets = employee.assets.filter((a) => a._id.toString() !== assetId);
    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Asset removed successfully',
      assets: employee.assets,
    });
  } catch (error) {
    console.error('Delete Asset Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete asset',
      error: error.message,
    });
  }
};

// @desc    Upload a profile photo
// @route   POST /api/users/:id/avatar
// @access  Private (Self or Admin)
const uploadUserAvatar = async (req, res) => {
  const removeUploaded = () => {
    if (!req.file) return;
    try {
      fs.unlinkSync(path.join(AVATAR_DIR, req.file.filename));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`Avatar cleanup failed: ${err.message}`);
    }
  };

  try {
    const { id } = req.params;
    const isSelf = req.user._id.toString() === id;
    const isAdmin = isAdminRole(req.user.role);

    if (!isSelf && !isAdmin) {
      removeUploaded();
      return res.status(403).json({
        success: false,
        message: 'You can only change your own profile photo.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please choose an image to upload.',
      });
    }

    if (!isRealImage(path.join(AVATAR_DIR, req.file.filename))) {
      removeUploaded();
      return res.status(400).json({
        success: false,
        message: 'That file is not a valid image. Please choose a JPG, PNG, or WEBP photo.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      removeUploaded();
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Delete the previous uploaded photo so old files do not pile up. Generated
    // initials avatars are data URIs, so there is nothing on disk to remove.
    if (employee.avatarFile) {
      try {
        fs.unlinkSync(path.join(AVATAR_DIR, employee.avatarFile));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error(`Old avatar cleanup failed: ${err.message}`);
      }
    }

    employee.avatarFile = req.file.filename;
    employee.avatar = `/api/files/avatars/${req.file.filename}`;
    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully',
      avatar: employee.avatar,
      employee,
    });
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    removeUploaded();
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile photo',
      error: error.message,
    });
  }
};

// @desc    Reset the profile photo back to generated initials
// @route   DELETE /api/users/:id/avatar
// @access  Private (Self or Admin)
const resetUserAvatar = async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.user._id.toString() === id;
    const isAdmin = isAdminRole(req.user.role);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only change your own profile photo.',
      });
    }

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (employee.avatarFile) {
      try {
        fs.unlinkSync(path.join(AVATAR_DIR, employee.avatarFile));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error(`Avatar cleanup failed: ${err.message}`);
      }
    }

    employee.avatarFile = '';
    employee.avatar = buildInitialsAvatar(employee.name, employee.email);
    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Profile photo reset to your initials',
      avatar: employee.avatar,
      employee,
    });
  } catch (error) {
    console.error('Reset Avatar Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset profile photo',
      error: error.message,
    });
  }
};

// @desc    Preview the monthly breakup for a CTC without saving anything
// @route   GET /api/users/salary-preview?annualCtc=1200000
// @access  Private (Admin only)
const previewSalaryBreakup = async (req, res) => {
  try {
    const annualCtc = Number(req.query.annualCtc);
    if (!annualCtc || annualCtc <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a positive annual CTC.',
      });
    }

    res.status(200).json({
      success: true,
      breakup: buildSalaryBreakup(annualCtc),
    });
  } catch (error) {
    console.error('Salary Preview Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to build salary preview',
      error: error.message,
    });
  }
};

// @desc    Set or revise an employee's salary structure
// @route   PUT /api/users/:id/salary
// @access  Private (Admin only)
//
// A revision is never an in-place edit: the outgoing structure is pushed to
// history first, so payslips already issued remain explainable.
const updateEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { annualCtc, effectiveFrom, note = '', components } = req.body;

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    let next;

    if (components && Object.keys(components).length > 0) {
      // HR typed the components by hand; trust them and derive the totals.
      const basic = Number(components.basic) || 0;
      const hra = Number(components.hra) || 0;
      const specialAllowance = Number(components.specialAllowance) || 0;
      const monthlyGross = basic + hra + specialAllowance;

      if (monthlyGross <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Salary components must add up to more than zero.',
        });
      }

      next = {
        annualCtc: Number(components.annualCtc) || Math.round(monthlyGross * 12),
        monthlyGross,
        basic,
        hra,
        specialAllowance,
        pf: Number(components.pf) || 0,
        professionalTax: Number(components.professionalTax) || 0,
        otherDeductions: Number(components.otherDeductions) || 0,
        isCustom: true,
      };
    } else {
      const ctc = Number(annualCtc);
      if (!ctc || ctc <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a positive annual CTC.',
        });
      }
      next = { ...buildSalaryBreakup(ctc), isCustom: false };
      delete next.totalDeductions;
      delete next.netMonthly;
    }

    next.effectiveFrom = effectiveFrom ? new Date(effectiveFrom) : new Date();

    // Archive the structure being replaced.
    if (employee.salary && employee.salary.monthlyGross > 0) {
      employee.salaryHistory.push({
        annualCtc: employee.salary.annualCtc,
        monthlyGross: employee.salary.monthlyGross,
        basic: employee.salary.basic,
        hra: employee.salary.hra,
        specialAllowance: employee.salary.specialAllowance,
        pf: employee.salary.pf,
        professionalTax: employee.salary.professionalTax,
        otherDeductions: employee.salary.otherDeductions,
        effectiveFrom: employee.salary.effectiveFrom,
        note: note || 'Superseded by a newer revision',
        revisedBy: req.user._id,
        revisedByName: req.user.name,
        revisedAt: new Date(),
      });
    }

    employee.salary = next;
    await employee.save();

    res.status(200).json({
      success: true,
      message: `Salary structure saved for ${employee.name} — monthly gross ₹${next.monthlyGross}`,
      salary: employee.salary,
      salaryHistory: employee.salaryHistory,
    });
  } catch (error) {
    console.error('Update Salary Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save salary structure',
      error: error.message,
    });
  }
};

// @desc    Clear all database data
// @route   DELETE /api/users/purge-database
// @access  Private (Admin only)
const clearAllData = async (req, res) => {
  try {
    // This wipes every collection and cannot be undone. Require an explicit
    // typed confirmation and block it outside development entirely, so a stray
    // request can never empty a live database.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_PURGE !== 'true') {
      return res.status(403).json({
        success: false,
        message: 'Database purge is disabled in production.',
      });
    }

    if (req.body?.confirm !== 'PURGE ALL DATA') {
      return res.status(400).json({
        success: false,
        message:
          'This permanently deletes every employee, payslip, leave and attendance record. Send { "confirm": "PURGE ALL DATA" } to proceed.',
      });
    }

    console.warn(`DATABASE PURGE requested by ${req.user.email} (${req.user._id})`);

    const Attendance = require('../models/Attendance');
    const Leave = require('../models/Leave');
    const Salary = require('../models/Salary');

    await User.deleteMany({});
    await Attendance.deleteMany({});
    await Leave.deleteMany({});
    await Salary.deleteMany({});
    await Department.deleteMany({});
    await Designation.deleteMany({});

    res.status(200).json({
      success: true,
      message: 'Database purged successfully. All collections are now empty.',
    });
  } catch (error) {
    console.error('Purge Database Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purge database',
      error: error.message,
    });
  }
};

module.exports = {
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
};
