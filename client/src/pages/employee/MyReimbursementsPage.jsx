import React, { useState, useEffect } from 'react';
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Wallet,
  MessageSquare,
  Ban,
  Download,
  Paperclip,
} from 'lucide-react';
import SubmitReimbursementModal from '../../components/reimbursement/SubmitReimbursementModal';
import api from '../../api/client';
import { downloadReimbursementReceipt, readBlobError } from '../../api/files';
import { useToast } from '../../context/ToastContext';

const MyReimbursementsPage = () => {
  const [reimbursements, setReimbursements] = useState([]);
  const [stats, setStats] = useState({ totalApplications: 0, pending: 0, approved: 0, rejected: 0, approvedAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const toast = useToast();

  const fetchMyReimbursements = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reimbursements/my-reimbursements');
      if (res.data.success) {
        setReimbursements(res.data.reimbursements || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (error) {
      toast.error('Failed to load reimbursement history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyReimbursements();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Approved
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Pending Review
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/25">
            <Ban className="w-3 h-3" /> Cancelled
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
            <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  const filteredReimbursements = reimbursements.filter((r) => {
    const matchesStatus = selectedStatus === 'All' || r.status === selectedStatus;
    const matchesSearch =
      !search ||
      r.category.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.expenseDate.includes(search);
    return matchesStatus && matchesSearch;
  });

  const handleCancel = async (reimbursement) => {
    const confirmed = window.confirm(`Withdraw your pending ${reimbursement.category} request for ₹${reimbursement.amount.toLocaleString('en-IN')}?`);
    if (!confirmed) return;

    try {
      const res = await api.put(`/reimbursements/${reimbursement._id}/cancel`);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchMyReimbursements();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel reimbursement request');
    }
  };

  const handleDownloadReceipt = async (reimbursement) => {
    try {
      await downloadReimbursementReceipt(reimbursement);
    } catch (err) {
      toast.error((await readBlobError(err)) || 'Failed to download receipt');
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Submit Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Reimbursements
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Claim work expenses and track HR approval status.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Submit Reimbursement</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Pending Requests
            </span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {stats.pending} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">awaiting review</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">HR evaluation queue</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Approved Amount
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              ₹{(stats.approvedAmount || 0).toLocaleString('en-IN')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">{stats.approved} approved claim(s)</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Rejected
            </span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{stats.rejected}</div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">Total requests: {stats.totalApplications}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl w-full sm:w-auto">
          {['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedStatus === status
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or description..."
            className="theme-input w-full pl-10 pr-4 text-xs"
          />
        </div>
      </div>

      {/* Reimbursement History Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">Loading reimbursement history...</span>
          </div>
        ) : filteredReimbursements.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
            No reimbursement requests found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Expense Date</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Receipt</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">HR Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                {filteredReimbursements.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25">
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

                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        {getStatusBadge(r.status)}
                        {r.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => handleCancel(r)}
                            title="Withdraw this request"
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-colors"
                          >
                            <Ban className="w-3 h-3" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-xs">
                      {r.adminComment ? (
                        <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                          <MessageSquare className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px]">{r.adminComment}</span>
                            {r.reviewedBy?.name && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                — {r.reviewedBy.name}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No comments</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SubmitReimbursementModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchMyReimbursements}
      />
    </div>
  );
};

export default MyReimbursementsPage;
