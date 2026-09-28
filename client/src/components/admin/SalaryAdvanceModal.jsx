import React, { useEffect, useState } from 'react';
import { HandCoins, X, Check, Ban, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../common/Tooltip';

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE = {
  Pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  Recovered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  Cancelled: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25',
};

/**
 * Admin / super-admin only. Records salary paid to an employee ahead of
 * payday; the next payroll run deducts it so it is not paid twice.
 */
const SalaryAdvanceModal = ({ employees = [], onClose, onChange }) => {
  const toast = useToast();
  const [advances, setAdvances] = useState([]);
  const [stats, setStats] = useState({ pending: 0, outstandingAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [form, setForm] = useState({
    userId: employees[0]?._id || '',
    amount: '',
    givenOn: today(),
    reason: '',
  });

  const loadAdvances = async () => {
    try {
      setLoading(true);
      const res = await api.get('/salary-advances', { params: { status: statusFilter } });
      if (res.data.success) {
        setAdvances(res.data.advances || []);
        setStats(res.data.stats || {});
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load salary advances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!form.userId && employees.length > 0) {
      setForm((prev) => ({ ...prev, userId: employees[0]._id }));
    }
  }, [employees, form.userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.userId || !(Number(form.amount) > 0) || !form.reason.trim()) {
      toast.error('Select an employee and enter the amount and reason');
      return;
    }
    try {
      setSaving(true);
      const res = await api.post('/salary-advances', form);
      if (res.data.success) {
        toast.success(res.data.message);
        setForm((prev) => ({ ...prev, amount: '', reason: '', givenOn: today() }));
        loadAdvances();
        onChange?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record advance');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (advance) => {
    if (!window.confirm(`Cancel the ${inr(advance.amount)} advance for ${advance.userId?.name}? It will no longer be deducted from salary.`)) {
      return;
    }
    try {
      const res = await api.put(`/salary-advances/${advance._id}/cancel`);
      if (res.data.success) {
        toast.success(res.data.message);
        loadAdvances();
        onChange?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel advance');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-3xl w-full p-6 shadow-soft space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Advance Salary</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Record salary given in advance. It is deducted automatically in the next payroll run.
              </p>
            </div>
          </div>
          <Tooltip label="Close" side="left">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        {/* New advance */}
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Employee *</label>
              <select
                required
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                className="theme-input w-full"
              >
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name} ({emp.employeeId}) — {emp.department}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="theme-input w-full"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Given on *</label>
              <input
                type="date"
                required
                value={form.givenOn}
                onChange={(e) => setForm({ ...form, givenOn: e.target.value })}
                className="theme-input w-full"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason *</label>
              <textarea
                required
                rows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Why was the advance given? e.g. medical emergency"
                className="theme-input w-full"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Record Advance
            </button>
          </div>
        </form>

        {/* Existing advances */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {statusFilter === 'Pending'
                ? `Still to recover: ${inr(stats.outstandingAmount)} across ${stats.pending || 0} advance(s)`
                : 'Advances'}
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="theme-input text-[11px]"
            >
              <option value="Pending">Pending</option>
              <option value="Recovered">Recovered</option>
              <option value="Cancelled">Cancelled</option>
              <option value="All">All</option>
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading advances...
            </div>
          ) : advances.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No {statusFilter === 'All' ? '' : statusFilter.toLowerCase()} advances.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {advances.map((a) => (
                <div key={a._id} className="px-4 py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {a.userId?.name || 'Employee'}
                      <span className="ml-2 text-[10px] font-medium text-slate-400">{a.userId?.employeeId}</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 mt-0.5 break-words">{a.reason}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Given {a.givenOn}
                      {a.createdBy?.name ? ` · by ${a.createdBy.name}` : ''}
                      {a.recoveries?.length > 0 &&
                        ` · recovered ${a.recoveries.map((r) => `${inr(r.amount)} (${r.month}/${r.year})`).join(', ')}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white">{inr(a.amount)}</div>
                    {a.status === 'Pending' && a.recoveredAmount > 0 && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400">
                        {inr(a.outstanding)} left
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_TONE[a.status]}`}>
                        {a.status}
                      </span>
                      {a.status === 'Pending' && (
                        <Tooltip label="Cancel advance" side="left">
                          <button
                            type="button"
                            aria-label="Cancel advance"
                            onClick={() => handleCancel(a)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalaryAdvanceModal;
