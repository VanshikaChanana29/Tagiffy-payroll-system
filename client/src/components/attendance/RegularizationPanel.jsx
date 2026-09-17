import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Plus, X, Clock, CheckCircle2, XCircle, Hourglass } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../common/Tooltip';

/**
 * Lets an employee ask HR to correct a day's attendance — a missed punch, a
 * wrong time, or a day wrongly marked absent.
 *
 * Employees never edit attendance directly; HR approves the change, which keeps
 * the record auditable.
 */
const RegularizationPanel = () => {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: '',
    requestedCheckIn: '',
    requestedCheckOut: '',
    requestedWorkMode: 'Office',
    reason: '',
  });

  const today = new Date().toISOString().slice(0, 10);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance/requests/my');
      if (res.data.success) {
        setRequests(res.data.requests || []);
        setStats(res.data.stats || { pending: 0, approved: 0, rejected: 0 });
      }
    } catch (err) {
      console.error('Failed to load correction requests', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date) {
      toast.error('Please pick the date you want corrected.');
      return;
    }
    if (!form.requestedCheckIn && !form.requestedCheckOut) {
      toast.error('Please enter at least a check-in or check-out time.');
      return;
    }
    if (!form.reason.trim()) {
      toast.error('Please explain why this correction is needed.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/attendance/requests', form);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowModal(false);
        setForm({
          date: '',
          requestedCheckIn: '',
          requestedCheckOut: '',
          requestedWorkMode: 'Office',
          reason: '',
        });
        fetchRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit correction request');
    } finally {
      setSubmitting(false);
    }
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

  const StatusIcon = ({ status }) => {
    if (status === 'Approved') return <CheckCircle2 className="w-3 h-3" />;
    if (status === 'Rejected') return <XCircle className="w-3 h-3" />;
    return <Hourglass className="w-3 h-3" />;
  };

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Attendance Corrections
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Missed a punch? Ask HR to fix the day — {stats.pending} pending
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/80 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Request Correction
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          Loading your requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          No correction requests yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req) => (
            <div
              key={req._id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {req.date}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {req.requestedCheckIn || '—'} to {req.requestedCheckOut || '—'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                    {req.requestedWorkMode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{req.reason}</p>
                {req.adminComment && (
                  <p className="text-[11px] mt-1.5 px-2 py-1 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                    <span className="font-bold">HR:</span> {req.adminComment}
                  </p>
                )}
              </div>

              <span
                className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle(
                  req.status
                )}`}
              >
                <StatusIcon status={req.status} />
                {req.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* REQUEST MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Request Correction
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    HR reviews this before anything changes
                  </p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="theme-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Check-in
                  </label>
                  <input
                    type="time"
                    value={form.requestedCheckIn}
                    onChange={(e) => setForm({ ...form, requestedCheckIn: e.target.value })}
                    className="theme-input w-full"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Check-out
                  </label>
                  <input
                    type="time"
                    value={form.requestedCheckOut}
                    onChange={(e) => setForm({ ...form, requestedCheckOut: e.target.value })}
                    className="theme-input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Work Mode
                </label>
                <select
                  value={form.requestedWorkMode}
                  onChange={(e) => setForm({ ...form, requestedWorkMode: e.target.value })}
                  className="theme-input w-full"
                >
                  <option value="Office">Office</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. Badge reader failed at the gate, so my punch-in was not recorded."
                  className="theme-input w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit to HR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegularizationPanel;
