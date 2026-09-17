import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Calendar,
  CreditCard,
  Plus,
  Edit2,
  Eye,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Sparkles,
  X,
  Check,
  Save,
  PlayCircle,
  Download,
} from 'lucide-react';
import api from '../../api/client';
import { downloadPayslip, readBlobError } from '../../api/payslips';
import useDepartments from '../../hooks/useDepartments';
import PayrollRunModal from '../../components/admin/PayrollRunModal';
import { useToast } from '../../context/ToastContext';
import demoAvatars from '../../utils/avatars';
import Tooltip from '../../components/common/Tooltip';

const PayrollManagementPage = () => {
  const departments = useDepartments();
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ totalGross: 0, totalNet: 0, totalDisbursed: 0, totalDeductions: 0 });
  const [employeesList, setEmployeesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Generate payslip form
  // Pay is CTC / 12, so a payslip needs the monthly figure and nothing else.
  // The month and year default to today rather than a hardcoded period.
  const [newSalary, setNewSalary] = useState({
    userId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basicSalary: 0,
    hra: 0,
    allowances: 0,
    deductions: { tax: 0, pf: 0, unpaidLeaveDeduction: 0, other: 0 },
    paymentStatus: 'Paid',
    remarks: 'Monthly salary disbursement',
  });

  const toast = useToast();

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const params = {
        month: selectedMonth,
        year: selectedYear,
      };
      if (department !== 'All') params.department = department;
      if (paymentStatusFilter !== 'All') params.paymentStatus = paymentStatusFilter;
      if (search) params.search = search;

      const [payRes, usersRes] = await Promise.all([
        api.get('/salaries/all', { params }),
        api.get('/users'),
      ]);

      if (payRes.data.success) {
        setRecords(payRes.data.records || []);
        if (payRes.data.stats) setStats(payRes.data.stats);
      }

      if (usersRes.data.success) {
        setEmployeesList(usersRes.data.employees || []);
        if (!newSalary.userId && usersRes.data.employees?.length > 0) {
          setNewSalary((prev) => ({ ...prev, userId: usersRes.data.employees[0]._id }));
        }
      }
    } catch (error) {
      toast.error('Failed to load payroll records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth, selectedYear, department, paymentStatusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayrollData();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Selecting an employee pulls their monthly pay straight from their CTC.
  const handleSelectEmployeeForPayslip = (userId) => {
    const employee = employees.find((emp) => emp._id === userId);
    const monthly = employee?.salary?.monthlyGross || 0;
    setNewSalary((prev) => ({ ...prev, userId, basicSalary: monthly }));
  };

  const handleDownloadPayslip = async (record) => {
    try {
      await downloadPayslip(record, record.userId?.name);
      toast.success('Payslip downloaded');
    } catch (err) {
      toast.error((await readBlobError(err)) || 'Failed to download payslip');
    }
  };

  const handleGeneratePayslip = async (e) => {
    e.preventDefault();
    if (!newSalary.userId || !newSalary.basicSalary) {
      toast.error('Please select an employee and specify basic salary');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/salaries', newSalary);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowGenerateModal(false);
        fetchPayrollData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate payslip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSalary = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setActionLoading(true);
    try {
      const res = await api.put(`/salaries/${selectedRecord._id}`, selectedRecord);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowEditModal(false);
        fetchPayrollData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update salary');
    } finally {
      setActionLoading(false);
    }
  };

  const months = [
    { num: 1, name: 'January' },
    { num: 2, name: 'February' },
    { num: 3, name: 'March' },
    { num: 4, name: 'April' },
    { num: 5, name: 'May' },
    { num: 6, name: 'June' },
    { num: 7, name: 'July' },
    { num: 8, name: 'August' },
    { num: 9, name: 'September' },
    { num: 10, name: 'October' },
    { num: 11, name: 'November' },
    { num: 12, name: 'December' },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Generate Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Payroll & Compensation
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage organization payroll, generate monthly payslips, and adjust statutory components.
          </p>
        </div>

        <button

          type="button"

          onClick={() => setShowRunModal(true)}

          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm"

        >

          <PlayCircle className="w-4 h-4" />

          Run Payroll

        </button>

        <button
          onClick={() => setShowGenerateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Monthly Payslip</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Disbursed</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{stats.totalDisbursed?.toLocaleString('en-IN')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">Disbursed net salary</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Gross Payroll</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              ₹{stats.totalGross?.toLocaleString('en-IN')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">Pre-deductions volume</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Deductions</span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              ₹{stats.totalDeductions?.toLocaleString('en-IN')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">Loss of pay & adjustments</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Processed Slips</span>
            <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">{records.length}</div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">Staff in cycle</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar (Month/Year, Dept, Search) */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Month and Year Selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Cycle:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="theme-input text-xs"
            >
              {months.map((m) => (
                <option key={m.num} value={m.num}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="theme-input text-xs"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="theme-input text-xs"
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name or ID..."
            className="theme-input w-full pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {/* Payroll Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">Loading company payroll records...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
            No salary records generated for this cycle. Click "Generate Monthly Payslip" to create.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Basic Pay</th>
                  <th className="px-6 py-4">Allowances</th>
                  <th className="px-6 py-4">Deductions</th>
                  <th className="px-6 py-4">Net Salary</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                {records.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                    {/* Employee info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={r.userId?.avatar || demoAvatars.generic(r.userId?.name?.slice(0, 2))}
                          alt={r.userId?.name}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {r.userId?.name || 'Staff Member'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {r.userId?.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-slate-900 dark:text-slate-200 font-semibold">{r.userId?.department}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.userId?.designation}</div>
                    </td>

                    <td className="px-6 py-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                      ₹{r.basicSalary?.toLocaleString('en-IN')}
                    </td>

                    <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400">
                      +₹{((r.hra || 0) + (r.allowances || 0))?.toLocaleString('en-IN')}
                    </td>

                    <td className="px-6 py-4 font-mono text-rose-600 dark:text-rose-400">
                      -₹{(r.grossSalary - r.netSalary)?.toLocaleString('en-IN')}
                    </td>

                    <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white text-sm">
                      ₹{r.netSalary?.toLocaleString('en-IN')}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          r.paymentStatus === 'Paid'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip label="View payslip" side="top">
                          <button aria-label="View payslip"
                            onClick={() => {
                              setSelectedRecord(r);
                              setShowViewModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit salary structure" side="top">
                          <button aria-label="Edit salary structure"
                            onClick={() => {
                              setSelectedRecord(JSON.parse(JSON.stringify(r)));
                              setShowEditModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white transition-all"
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

      {/* MODAL 1: GENERATE MONTHLY PAYSLIP */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Generate Monthly Payslip</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Create employee salary breakdown</p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowGenerateModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleGeneratePayslip} className="space-y-4 text-xs">
              {/* Employee Selection */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Employee *</label>
                <select
                  required
                  value={newSalary.userId}
                  onChange={(e) => handleSelectEmployeeForPayslip(e.target.value)}
                                      className="theme-input w-full"
                >
                  {employeesList.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name} ({emp.employeeId}) — {emp.department}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month and Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pay Month</label>
                  <select
                    value={newSalary.month}
                    onChange={(e) => setNewSalary({ ...newSalary, month: Number(e.target.value) })}
                    className="theme-input w-full"
                  >
                    {months.map((m) => (
                      <option key={m.num} value={m.num}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Pay Year</label>
                  <input
                    type="number"
                    value={newSalary.year}
                    onChange={(e) => setNewSalary({ ...newSalary, year: Number(e.target.value) })}
                    className="theme-input w-full"
                  />
                </div>
              </div>

              {/* Monthly pay — CTC / 12 */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Monthly Pay
                </span>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Monthly salary (₹) — CTC ÷ 12
                  </label>
                  <input
                    type="number"
                    required
                    value={newSalary.basicSalary}
                    onChange={(e) =>
                      setNewSalary({ ...newSalary, basicSalary: Number(e.target.value) })
                    }
                    className="theme-input w-full"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Filled in from the employee's CTC. No PF, professional tax or TDS is
                    deducted.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Loss of pay (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newSalary.deductions.unpaidLeaveDeduction}
                    onChange={(e) =>
                      setNewSalary({
                        ...newSalary,
                        deductions: {
                          ...newSalary.deductions,
                          unpaidLeaveDeduction: Number(e.target.value),
                        },
                      })
                    }
                    className="theme-input w-full"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave at 0 unless you are deducting unpaid days by hand. The monthly
                    payroll run works this out automatically.
                  </p>
                </div>
              </div>

              {/* Calculated preview */}
              <div className="p-3.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/40 flex justify-between items-center text-xs">
                <span className="text-brand-700 dark:text-brand-300 font-semibold">Estimated Net Take-Home:</span>
                <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                  ₹
                  {Math.max(
                    0,
                    Number(newSalary.basicSalary || 0) -
                      Number(newSalary.deductions?.unpaidLeaveDeduction || 0)
                  ).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Save & Disburse Payslip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT SALARY STRUCTURE */}
      {showEditModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Edit Salary • {selectedRecord.userId?.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cycle: {selectedRecord.month}/{selectedRecord.year}
                  </p>
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

            <form onSubmit={handleUpdateSalary} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Monthly Pay
                </span>
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    Monthly salary (₹) — CTC ÷ 12
                  </label>
                  <input
                    type="number"
                    value={selectedRecord.basicSalary}
                    onChange={(e) =>
                      setSelectedRecord({ ...selectedRecord, basicSalary: Number(e.target.value) })
                    }
                    className="theme-input w-full"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                  Deductions
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Loss of pay (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={selectedRecord.deductions?.unpaidLeaveDeduction || 0}
                      onChange={(e) =>
                        setSelectedRecord({
                          ...selectedRecord,
                          deductions: {
                            ...selectedRecord.deductions,
                            unpaidLeaveDeduction: Number(e.target.value),
                          },
                        })
                      }
                      className="theme-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      Other deductions (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={selectedRecord.deductions?.other || 0}
                      onChange={(e) =>
                        setSelectedRecord({
                          ...selectedRecord,
                          deductions: {
                            ...selectedRecord.deductions,
                            other: Number(e.target.value),
                          },
                        })
                      }
                      className="theme-input w-full"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  No PF, professional tax or TDS — pay is CTC ÷ 12 less days not worked.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Status</label>
                <select
                  value={selectedRecord.paymentStatus}
                  onChange={(e) =>
                    setSelectedRecord({
                      ...selectedRecord,
                      paymentStatus: e.target.value,
                    })
                  }
                  className="theme-input w-full"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Adjustments
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW FORMAL PAYSLIP */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Employee Payslip Document</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedRecord.userId?.name} • Cycle {selectedRecord.month}/{selectedRecord.year}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadPayslip(selectedRecord)}
                className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowViewModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase">Employee</span>
                  <div className="text-slate-900 dark:text-white font-bold">{selectedRecord.userId?.name}</div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase">Employee ID</span>
                  <div className="text-slate-800 dark:text-slate-200 font-mono">{selectedRecord.userId?.employeeId}</div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase">Department</span>
                  <div className="text-slate-800 dark:text-slate-200">{selectedRecord.userId?.department}</div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 uppercase">Status</span>
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedRecord.paymentStatus}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-800 pb-1">
                    Earnings
                  </span>
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>Basic:</span>
                    <span className="font-mono font-semibold">₹{selectedRecord.basicSalary?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>HRA:</span>
                    <span className="font-mono font-semibold">₹{selectedRecord.hra?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>Allowances:</span>
                    <span className="font-mono font-semibold">₹{selectedRecord.allowances?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Gross:</span>
                    <span className="font-mono">₹{selectedRecord.grossSalary?.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block border-b border-slate-200 dark:border-slate-800 pb-1">
                    Deductions
                  </span>
                  {(selectedRecord.deductions?.pf || 0) > 0 && (
                    <div className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>PF:</span>
                      <span className="font-mono font-semibold">₹{selectedRecord.deductions.pf.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(selectedRecord.deductions?.tax || 0) > 0 && (
                    <div className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Tax:</span>
                      <span className="font-mono font-semibold">₹{selectedRecord.deductions.tax.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>Unpaid Leave:</span>
                    <span className="font-mono font-semibold">₹{(selectedRecord.deductions?.unpaidLeaveDeduction || 0)?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Total Deductions:</span>
                    <span className="font-mono">₹{(selectedRecord.grossSalary - selectedRecord.netSalary)?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-500/30 flex justify-between items-center">
                <span className="text-brand-700 dark:text-brand-300 font-bold">Net Salary Payable:</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                  ₹{selectedRecord.netSalary?.toLocaleString('en-IN')}
                </span>
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
      {showRunModal && (
        <PayrollRunModal
          month={selectedMonth}
          year={selectedYear}
          onClose={() => setShowRunModal(false)}
          onComplete={fetchPayrollData}
        />
      )}
    </div>
  );
};

export default PayrollManagementPage;
