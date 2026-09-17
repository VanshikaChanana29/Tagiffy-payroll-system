import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Check, X, Clock, Hourglass, CheckCircle2, XCircle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';

/**
 * HR's queue of employee-raised attendance corrections.
 *
 * Approving rewrites the real attendance record for that day and recalculates
 * hours, late marks and overtime; rejecting requires an explanation.
 */
const RegularizationApprovals = ({ onApproved }) => {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectComment, setRejectComment] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance/requests', { params: { status: statusFilter } });
      if (res.data.success) {
        setRequests(res.data.requests || []);
        setStats(res.data.stats || { pending: 0, approved: 0, rejected: 0 });
      }
    } catch (err) {
      toast.error('Failed to load correction requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const review = async (id, status, adminComment = '') => {
    try {
      const res = await api.put(`/attendance/requests/${id}`, { status, adminComment });
      if (res.data.success) {
        toast.success(res.data.message);
        setRejectTarget(null);
        setRejectComment('');
        fetchRequests();
        // The approved correction changed real attendance, so refresh the table.
        if (status === 'Approved' && onApproved) onApproved();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to review request');
    }
  };

  const submitRejection = (e) => {
    e.preventDefault();
    if (!rejectComment.trim()) {
      toast.error('Please explain why the correction is being rejected.');
      return;
    }
    review(rejectTarget._id, 'Rejected', rejectComment);
  };

  const statusStyle = (status) => {
    if (status === 'Approved') {
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    }
    if (status === 'Rejected') {
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    }
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  };

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Attendance Correction Requests
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {stats.pending} pending · {stats.approved} approved · {stats.rejected} rejected
            </p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="theme-input text-xs"
        >
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="All">All</option>
        </select>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          Loading requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          No {statusFilter.toLowerCase()} correction requests.
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req) => (
            <div
              key={req._id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="flex items-start gap-3 min-w-0">
                <img
                  src={req.userId?.avatar}
                  alt={req.userId?.name}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {req.userId?.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {req.userId?.employeeId}
                    </span>
                    <span className="text-xs font-bold text-brand-600 dark:text-brand-400">
                      {req.date}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {req.requestedCheckIn || '—'} to {req.requestedCheckOut || '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    {req.reason}
                  </p>
                  {req.adminComment && (
                    <p className="text-[11px] mt-1.5 px-2 py-1 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span className="font-bold">HR:</span> {req.adminComment}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle(
                    req.status
                  )}`}
                >
                  {req.status === 'Approved' && <CheckCircle2 className="w-3 h-3" />}
                  {req.status === 'Rejected' && <XCircle className="w-3 h-3" />}
                  {req.status === 'Pending' && <Hourglass className="w-3 h-3" />}
                  {req.status}
                </span>

                {req.status === 'Pending' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => review(req._id, 'Approved', 'Correction applied.')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectTarget(req);
                        setRejectComment('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Reject Correction
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {rejectTarget.userId?.name} · {rejectTarget.date}
                </p>
              </div>
            </div>

            <form onSubmit={submitRejection} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason for rejection *
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="e.g. Security log shows no entry on this date."
                  className="theme-input w-full"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  The employee sees this on their attendance page.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegularizationApprovals;
