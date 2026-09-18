import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Edit2,
  Eye,
  CheckCircle2,
  Mail,
  Building,
  X,
  Save,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Download,
  UploadCloud,
} from 'lucide-react';
import api from '../../api/client';
import { downloadEmployeeTemplate, uploadEmployeeSheet } from '../../api/files';
import { useToast } from '../../context/ToastContext';
import demoAvatars from '../../utils/avatars';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useEmployeeInspection } from '../../context/EmployeeInspectionContext';
import Tooltip from '../../components/common/Tooltip';
import { useAuth } from '../../context/AuthContext';

const EmployeeDirectoryPage = () => {
  const navigate = useNavigate();
  const { selectEmployee } = useEmployeeInspection();
  const { isSuperAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [orgDepartments, setOrgDepartments] = useState([]);
  const [orgDesignations, setOrgDesignations] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Bulk upload state
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTemplateLoading, setBulkTemplateLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // New employee form
  const [ctcBreakup, setCtcBreakup] = useState(null);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    password: 'employee123',
    role: 'employee',
    department: '',
    designation: '',
    reportingManager: '',
    annualCtc: '',
    phone: '+91 ',
    joiningDate: format(new Date(), 'yyyy-MM-dd'),
    leaveBalance: { paid: 14, sick: 7, unpaid: 0 },
    address: { street: '', city: 'Bengaluru', state: 'Karnataka', zip: '' },
    emergencyContact: { name: '', relation: '', phone: '+91 ' },
  });

  const toast = useToast();

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (selectedDept !== 'All') params.department = selectedDept;
      if (selectedStatus !== 'All') params.status = selectedStatus;

      const res = await api.get('/users', { params });
      if (res.data.success) {
        setEmployees(res.data.employees);
        if (res.data.departments) setDepartments(res.data.departments);
      }
    } catch (error) {
      toast.error('Failed to load employee directory');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgData = async () => {
    try {
      const [deptRes, desigRes, mgrRes] = await Promise.all([
        api.get('/departments'),
        api.get('/designations'),
        api.get('/users/managers'),
      ]);
      if (deptRes.data.success) setOrgDepartments(deptRes.data.departments);
      if (desigRes.data.success) setOrgDesignations(desigRes.data.designations);
      if (mgrRes.data.success) setManagers(mgrRes.data.managers);
    } catch (error) {
      toast.error('Failed to load departments/designations. Set them up in Org Settings first.');
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [selectedDept, selectedStatus]);

  // Debounced search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchEmployees();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Show the monthly breakup as the CTC is typed, so HR sees what the employee
  // will actually be paid before the record is created.
  useEffect(() => {
    const ctc = Number(newEmployee.annualCtc);
    if (!ctc || ctc <= 0) {
      setCtcBreakup(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      api
        .get('/users/salary-preview', { params: { annualCtc: ctc } })
        .then((res) => {
          if (res.data.success) setCtcBreakup(res.data.breakup);
        })
        .catch(() => setCtcBreakup(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [newEmployee.annualCtc]);

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.email || !newEmployee.department || !newEmployee.designation) {
      toast.error('Please fill in all required fields');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/users', newEmployee);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowAddModal(false);
        setNewEmployee({
          name: '',
          email: '',
          password: 'employee123',
          role: 'employee',
          department: '',
          designation: '',
          reportingManager: '',
    annualCtc: '',
          phone: '+91 ',
          joiningDate: format(new Date(), 'yyyy-MM-dd'),
          leaveBalance: { paid: 14, sick: 7, unpaid: 0 },
          address: { street: '', city: 'Bengaluru', state: 'Karnataka', zip: '' },
          emergencyContact: { name: '', relation: '', phone: '+91 ' },
        });
        fetchEmployees();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error creating employee');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setBulkTemplateLoading(true);
    try {
      await downloadEmployeeTemplate();
    } catch (error) {
      toast.error('Failed to download the template file');
    } finally {
      setBulkTemplateLoading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error('Please choose a file to upload');
      return;
    }

    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await uploadEmployeeSheet(bulkFile);
      if (res.data.success) {
        setBulkResult(res.data);
        if (res.data.createdCount > 0) {
          toast.success(res.data.message);
          fetchEmployees();
        } else {
          toast.error('No rows could be onboarded. See the details below.');
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload the file');
    } finally {
      setBulkLoading(false);
    }
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkFile(null);
    setBulkResult(null);
  };

  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setActionLoading(true);
    try {
      const res = await api.put(`/users/${selectedEmployee._id}`, selectedEmployee);
      if (res.data.success) {
        toast.success('Employee updated successfully');
        setShowEditModal(false);
        fetchEmployees();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error updating employee');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (employee) => {
    const newStatus = employee.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await api.put(`/users/${employee._id}`, { status: newStatus });
      if (res.data.success) {
        toast.success(`Status updated to ${newStatus}`);
        fetchEmployees();
      }
    } catch (error) {
      toast.error('Failed to change employee status');
    }
  };

  const activeCount = employees.filter((e) => e.status === 'Active').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Metric summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Employee Directory
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage organization workforce, departmental distribution, and staff onboarding.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk Upload</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Onboard New Employee</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Total Workforce
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{employees.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Active Staff
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{activeCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Departments
            </span>
            <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">
              {departments.length || 5}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Building className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name, ID, role..."
            className="theme-input w-full pl-10 pr-4 text-xs"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Dept:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="theme-input text-xs"
            >
              <option value="All">All Departments</option>
              {orgDepartments.map((d) => (
                <option key={d._id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="theme-input text-xs"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Loading employee directory...</span>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm">No employees match your search filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">ID & Role</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Leave Balances</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {employees.map((emp) => (
                  <tr
                    key={emp._id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors group"
                  >
                    {/* Employee avatar & name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={emp.avatar || demoAvatars.generic(emp.name?.slice(0, 2))}
                          alt={emp.name}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                            {emp.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ID & Role */}
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {emp.employeeId}
                      </div>
                      <span
                        className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          emp.role === 'super_admin'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
                            : emp.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
                            : emp.role === 'manager'
                            ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25'
                            : 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25'
                        }`}
                      >
                        {emp.role === 'super_admin' ? 'Super Admin' : emp.role}
                      </span>
                    </td>

                    {/* Department & Designation */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-200">{emp.department}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{emp.designation}</div>
                      {emp.reportingManager?.name && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Reports to {emp.reportingManager.name}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(emp)}
                        title="Click to toggle status"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                          emp.status === 'Active'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 hover:bg-rose-500/25'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            emp.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {emp.status}
                      </button>
                    </td>

                    {/* Leave balance */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                          Paid: <strong className="text-emerald-600 dark:text-emerald-400">{emp.leaveBalance?.paid || 0}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                          Sick: <strong className="text-brand-600 dark:text-brand-400">{emp.leaveBalance?.sick || 0}</strong>
                        </span>
                      </div>
                    </td>

                    {/* Action buttons */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            selectEmployee(emp, 'dashboard');
                            navigate('/admin/employee-view');
                          }}
                          title="Inspect Full Employee Context"
                          className="px-2.5 py-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500 text-brand-700 dark:text-brand-300 hover:text-white border border-brand-500/30 text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Context</span>
                        </button>
                        <Tooltip label="Quick view of this employee" side="top">
                          <button aria-label="Quick view of this employee"
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setShowViewModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit employee details" side="top">
                          <button aria-label="Edit employee details"
                            onClick={() => {
                              setSelectedEmployee(JSON.parse(JSON.stringify(emp)));
                              setShowEditModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600 text-brand-700 dark:text-brand-300 hover:text-white transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD NEW EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Onboard New Employee</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add a team member to the Taggify workforce</p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    placeholder="e.g. Ramesh Patel"
                    className="theme-input w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    placeholder="ramesh@taggify.in"
                    className="theme-input w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Role *</label>
                  <select
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                    className="theme-input w-full"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    {isSuperAdmin && <option value="admin">Admin / HR</option>}
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Department *</label>
                  <select
                    required
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                    className="theme-input w-full"
                  >
                    <option value="">Select department...</option>
                    {orgDepartments.map((d) => (
                      <option key={d._id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                  {orgDepartments.length === 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      No departments yet — create one in Org Settings first.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Designation *</label>
                  <select
                    required
                    value={newEmployee.designation}
                    onChange={(e) => setNewEmployee({ ...newEmployee, designation: e.target.value })}
                    className="theme-input w-full"
                  >
                    <option value="">Select designation...</option>
                    {orgDesignations.map((d) => (
                      <option key={d._id} value={d.title}>{d.title}</option>
                    ))}
                  </select>
                  {orgDesignations.length === 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      No designations yet — create one in Org Settings first.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reporting Manager</label>
                  <select
                    value={newEmployee.reportingManager}
                    onChange={(e) => setNewEmployee({ ...newEmployee, reportingManager: e.target.value })}
                    className="theme-input w-full"
                  >
                    <option value="">None</option>
                    {managers.map((m) => (
                      <option key={m._id} value={m._id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="theme-input w-full"
                  />
                </div>
              </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Annual CTC (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={newEmployee.annualCtc}
                    onChange={(e) => setNewEmployee({ ...newEmployee, annualCtc: e.target.value })}
                    placeholder="e.g. 1200000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  {ctcBreakup ? (
                    <div className="mt-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/25 flex items-center gap-2.5 flex-wrap">
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">
                        ₹{Number(newEmployee.annualCtc).toLocaleString('en-IN')} ÷ 12 =
                      </span>
                      <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                        ₹{ctcBreakup.monthlyGross.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        per month
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Optional, but without it this employee is skipped by the monthly payroll run.
                    </p>
                  )}
                </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Save & Onboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT EMPLOYEE */}
      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Edit Employee • {selectedEmployee.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedEmployee.employeeId}</p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowEditModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={selectedEmployee.name}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, name: e.target.value })
                    }
                    className="theme-input w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email</label>
                  <input
                    type="email"
                    value={selectedEmployee.email}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, email: e.target.value })
                    }
                    className="theme-input w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Department</label>
                  <select
                    value={selectedEmployee.department}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, department: e.target.value })
                    }
                    className="theme-input w-full"
                  >
                    {!orgDepartments.some((d) => d.name === selectedEmployee.department) && (
                      <option value={selectedEmployee.department}>{selectedEmployee.department} (legacy)</option>
                    )}
                    {orgDepartments.map((d) => (
                      <option key={d._id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Designation</label>
                  <select
                    value={selectedEmployee.designation}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, designation: e.target.value })
                    }
                    className="theme-input w-full"
                  >
                    {!orgDesignations.some((d) => d.title === selectedEmployee.designation) && (
                      <option value={selectedEmployee.designation}>{selectedEmployee.designation} (legacy)</option>
                    )}
                    {orgDesignations.map((d) => (
                      <option key={d._id} value={d.title}>{d.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Role</label>
                  <select
                    value={selectedEmployee.role}
                    onChange={(e) => setSelectedEmployee({ ...selectedEmployee, role: e.target.value })}
                    className="theme-input w-full"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    {isSuperAdmin && <option value="admin">Admin / HR</option>}
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reporting Manager</label>
                  <select
                    value={selectedEmployee.reportingManager?._id || selectedEmployee.reportingManager || ''}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, reportingManager: e.target.value })
                    }
                    className="theme-input w-full"
                  >
                    <option value="">None</option>
                    {managers
                      .filter((m) => m._id !== selectedEmployee._id)
                      .map((m) => (
                        <option key={m._id} value={m._id}>{m.name} ({m.role})</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={selectedEmployee.status}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, status: e.target.value })
                    }
                    className="theme-input w-full"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={selectedEmployee.phone || ''}
                    onChange={(e) =>
                      setSelectedEmployee({ ...selectedEmployee, phone: e.target.value })
                    }
                    className="theme-input w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW EMPLOYEE DETAILS */}
      {showViewModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={selectedEmployee.avatar || demoAvatars.generic(selectedEmployee.name?.slice(0, 2))}
                  alt={selectedEmployee.name}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedEmployee.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedEmployee.employeeId} • {selectedEmployee.designation}
                  </p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowViewModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Department</span>
                  <div className="text-slate-900 dark:text-white font-semibold mt-0.5">
                    {selectedEmployee.department}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Work Email</span>
                  <div className="text-slate-900 dark:text-white font-semibold mt-0.5">{selectedEmployee.email}</div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Phone</span>
                  <div className="text-slate-900 dark:text-white font-semibold mt-0.5">
                    {selectedEmployee.phone || 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Status</span>
                  <div
                    className={`font-semibold mt-0.5 ${
                      selectedEmployee.status === 'Active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {selectedEmployee.status}
                  </div>
                </div>
              </div>

              {/* Leave Balances */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Paid Leaves</span>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedEmployee.leaveBalance?.paid || 0} days
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Sick Leaves</span>
                  <div className="text-lg font-bold text-brand-600 dark:text-brand-400">
                    {selectedEmployee.leaveBalance?.sick || 0} days
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Total Quota</span>
                  <div className="text-lg font-bold text-brand-600 dark:text-brand-400">
                    {(selectedEmployee.leaveBalance?.paid || 0) +
                      (selectedEmployee.leaveBalance?.sick || 0)}{' '}
                    days
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: BULK UPLOAD EMPLOYEES */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Bulk Upload Employees</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Onboard many employees at once from an Excel or CSV sheet
                  </p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={closeBulkModal}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <div className="space-y-4 text-xs">
              {/* Step 1: template */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">1. Download the template</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Fill in Name and Email for each employee. Emp.code, DOJ, Contact No., Salary,
                    Account no., IFSC code, and Bank name are optional — Department and Designation
                    are assigned manually after upload.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={bulkTemplateLoading}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>

              {/* Step 2: upload */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200">2. Upload the filled-in sheet</div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    setBulkFile(e.target.files?.[0] || null);
                    setBulkResult(null);
                  }}
                  className="block w-full text-[11px] text-slate-600 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-500 file:text-white hover:file:bg-brand-600 file:cursor-pointer cursor-pointer"
                />
                {bulkFile && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Selected: {bulkFile.name}</p>
                )}
              </div>

              {/* Results */}
              {bulkResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                      {bulkResult.createdCount} onboarded
                    </span>
                    {bulkResult.failedCount > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                        {bulkResult.failedCount} skipped
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      of {bulkResult.totalRows} row(s) in the file
                    </span>
                  </div>

                  {bulkResult.failed?.length > 0 && (
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold sticky top-0">
                          <tr>
                            <th className="px-3 py-2">Row</th>
                            <th className="px-3 py-2">Name / Email</th>
                            <th className="px-3 py-2">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                          {bulkResult.failed.map((f, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 font-mono">{f.row}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                {f.name || f.email || '—'}
                              </td>
                              <td className="px-3 py-2 text-rose-600 dark:text-rose-400">{f.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={closeBulkModal}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
              >
                {bulkResult ? 'Done' : 'Cancel'}
              </button>
              {!bulkResult && (
                <button
                  type="button"
                  onClick={handleBulkUpload}
                  disabled={bulkLoading || !bulkFile}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {bulkLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  Upload & Onboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDirectoryPage;
