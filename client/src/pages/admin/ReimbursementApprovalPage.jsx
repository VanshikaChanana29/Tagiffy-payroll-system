import React, { useState, useEffect } from 'react';
import {
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Check,
  X,
  Download,
  Paperclip,
} from 'lucide-react';
import api from '../../api/client';
import { downloadReimbursementReceipt, readBlobError } from '../../api/files';
import useDepartments from '../../hooks/useDepartments';
import { useToast } from '../../context/ToastContext';
import demoAvatars from '../../utils/avatars';
import Tooltip from '../../components/common/Tooltip';

const ReimbursementApprovalPage = () => {
  const departments = useDepartments();
  const [reimbursements, setReimbursements] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [department, setDepartment] = useState('All');
  const [search, setSearch] = useState('');

  // Decision Modal state
  const [selectedReimbursement, setSelectedReimbursement] = useState(null);
  const [decisionType, setDecisionType] = useState('Approved');
  const [adminComment, setAdminComment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const toast = useToast();

  const fetchReimbursements = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'All') params.status = statusFilter;
      if (department !== 'All') params.department = department;
      if (search) params.search = search;

      const res = await api.get('/reimbursements/all', { params });
      if (res.data.success) {
        setReimbursements(res.data.reimbursements || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (error) {
      toast.error('Failed to load reimbursement requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReimbursements();
  }, [statusFilter, department]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReimbursements();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openDecisionModal = (reimbursement, type) => {
    setSelectedReimbursement(reimbursement);
    setDecisionType(type);
    setAdminComment(
      type === 'Approved'
        ? 'Approved. Reimbursement will be processed in the next payroll cycle.'
        : 'Unfortunately, this claim cannot be reimbursed.'
    );
    setShowModal(true);
  };

  const handleDecisionSubmit = async (e) => {
    e.preventDefault();

    if (decisionType === 'Rejected' && !adminComment.trim()) {
      toast.error('Please give a reason so the employee understands the decision.');
      return;
    }
    if (!selectedReimbursement) return;

    setActionLoading(true);
    try {
      const res = await api.put(`/reimbursements/${selectedReimbursement._id}/status`, {
        status: decisionType,
        adminComment,
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setShowModal(false);
        fetchReimbursements();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update reimbursement status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadReceipt = async (reimbursement) => {
    try {
      await downloadReimbursementReceipt(reimbursement);
    } catch (err) {
      toast.error((await readBlobError(err)) || 'Failed to download receipt');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Approved
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pending
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Reimbursement Approvals
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Review employee expense claims, approve payouts, and add administrative remarks.
        </p>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Pending Review</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.pending}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Approved</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.approved}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Rejected</span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{stats.rejected}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Requests</span>
            <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">{stats.total}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl w-full md:w-auto">
          {['Pending', 'Approved', 'Rejected', 'Cancelled', 'All'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === status
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {status}
              {status === 'Pending' && stats.pending > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full bg-amber-400 text-slate-950 font-black">
                  {stats.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
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

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or description..."
              className="theme-input w-full pl-9 pr-3 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">Loading reimbursement requests...</span>
          </div>
        ) : reimbursements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
            No {statusFilter !== 'All' ? statusFilter.toLowerCase() : ''} reimbursement requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Expense Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Receipt</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions / Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                {reimbursements.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
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
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {r.userId?.department} •{' '}
                            <span className="font-mono">{r.userId?.employeeId}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25">
                        {r.category}
                      </span>
                    </td>

                    <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">
                      ₹{r.amount?.toLocaleString('en-IN')}
                    </td>

                    <td className="px-6 py-4 font-mono text-slate-800 dark:text-slate-200">{r.expenseDate}</td>

                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-xs">{r.description}</td>

                    <td className="px-6 py-4">
                      {r.receipt?.storedName ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(r)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/25 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Receipt
                        </button>
                      ) : (
                        <span className="text-slate-400 italic inline-flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> None
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">{getStatusBadge(r.status)}</td>

                    <td className="px-6 py-4 text-right">
                      {r.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDecisionModal(r, 'Approved')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white font-semibold transition-all inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => openDecisionModal(r, 'Rejected')}
                            className="px-3 py-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white font-semibold transition-all inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : r.status === 'Cancelled' ? (
                        <span className="text-[11px] text-slate-400 italic">Withdrawn by employee</span>
                      ) : (
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[150px]">
                            {r.adminComment ? `"${r.adminComment}"` : 'Reviewed'}
                          </span>
                          <button
                            onClick={() =>
                              openDecisionModal(
                                r,
                                r.status === 'Approved' ? 'Rejected' : 'Approved'
                              )
                            }
                            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline mt-0.5"
                          >
                            Change Decision
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DECISION MODAL */}
      {showModal && selectedReimbursement && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {decisionType === 'Approved' ? 'Approve Reimbursement' : 'Reject Reimbursement'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedReimbursement.userId?.name} • ₹{selectedReimbursement.amount?.toLocaleString('en-IN')} ({selectedReimbursement.category})
                </p>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleDecisionSubmit} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Expense Date:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{selectedReimbursement.expenseDate}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Description:</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedReimbursement.description}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Receipt:</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {selectedReimbursement.receipt?.storedName ? 'Attached' : 'Not attached'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {decisionType === 'Rejected'
                    ? 'Reason for rejection *'
                    : 'HR Administrator Remarks / Comment'}
                </label>
                <textarea
                  rows={3}
                  required={decisionType === 'Rejected'}
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder={
                    decisionType === 'Rejected'
                      ? 'Explain why this claim cannot be reimbursed...'
                      : 'Enter comments visible to employee...'
                  }
                  className="theme-input w-full resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`px-5 py-2 rounded-xl text-white font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                    decisionType === 'Approved'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {actionLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : decisionType === 'Approved' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  Confirm {decisionType}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReimbursementApprovalPage;
