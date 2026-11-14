import React, { useState } from 'react';
import { UserMinus, X, Save } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import {
  EXIT_TYPES,
  createExit,
  updateExit,
  toDateInput,
  noticeDateLabel,
} from '../../api/exits';

/**
 * Record (or correct) an employee's exit: type, resignation / termination
 * date, last working day and reason.
 *
 * Pass `employee` to record a new exit, or `exit` to edit an existing one.
 */
const RecordExitModal = ({ employee, exit, onClose, onSaved }) => {
  const toast = useToast();
  const today = toDateInput(new Date());
  const person = exit ? exit.snapshot : employee;

  const [form, setForm] = useState({
    exitType: exit?.exitType || 'Resigned',
    noticeDate: exit ? toDateInput(exit.noticeDate) : today,
    lastWorkingDay: exit ? toDateInput(exit.lastWorkingDay) : '',
    reason: exit?.reason || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // A termination usually ends the same day; prefill it.
      if (key === 'exitType' && value === 'Terminated' && !f.lastWorkingDay) next.lastWorkingDay = f.noticeDate;
      return next;
    });
  };

  const lwdBeforeNotice = form.lastWorkingDay && form.noticeDate && form.lastWorkingDay < form.noticeDate;
  const lwdPassed = form.lastWorkingDay && form.lastWorkingDay < today;

  let outcome = null;
  if (form.lastWorkingDay && !lwdBeforeNotice) {
    const lwd = format(new Date(`${form.lastWorkingDay}T00:00:00`), 'dd MMM yyyy');
    outcome = lwdPassed
      ? `The account will be deactivated right away (last working day ${lwd} has passed).`
      : `${person.name} stays active until ${lwd} and is deactivated automatically the next day.`;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lwdBeforeNotice) return;
    setSaving(true);
    try {
      const res = exit
        ? await updateExit(exit._id, form)
        : await createExit({ ...form, employeeId: employee._id });
      toast.success(res.data.message);
      onSaved?.(res.data.exit);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save the exit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <UserMinus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {exit ? 'Edit exit' : 'Record exit'} • {person.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {person.employeeId} • {person.designation}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="theme-label">Exit type</label>
            <select value={form.exitType} onChange={set('exitType')} className="theme-input w-full" required>
              {EXIT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="theme-label">{noticeDateLabel(form.exitType)}</label>
              <input
                type="date"
                value={form.noticeDate}
                onChange={set('noticeDate')}
                className="theme-input w-full"
                required
              />
            </div>
            <div>
              <label className="theme-label">Last working day</label>
              <input
                type="date"
                value={form.lastWorkingDay}
                min={form.noticeDate || undefined}
                onChange={set('lastWorkingDay')}
                className="theme-input w-full"
                required
              />
            </div>
          </div>
          {lwdBeforeNotice && (
            <p className="text-rose-600 dark:text-rose-400">
              The last working day cannot be before the {noticeDateLabel(form.exitType).toLowerCase()}.
            </p>
          )}

          <div>
            <label className="theme-label">Reason / notes (optional)</label>
            <textarea
              value={form.reason}
              onChange={set('reason')}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Moving to another city. Notice period served in full."
              className="theme-input w-full resize-none"
            />
          </div>

          {outcome && (
            <p className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200">
              {outcome}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || lwdBeforeNotice} className="btn-primary">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : exit ? 'Save changes' : 'Record exit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordExitModal;
