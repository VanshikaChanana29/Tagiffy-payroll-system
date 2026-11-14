import React, { useState } from 'react';
import { FastForward, X } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import { relieveEarly, toDateInput } from '../../api/exits';

const fmt = (d) => format(new Date(d), 'dd MMM yyyy');

const REASONS = ['Replacement found', 'Role no longer needed', 'Handover completed', 'Requested by employee'];

/** HR moves a serving-notice employee's last working day earlier. */
const RelieveEarlyModal = ({ exit, onClose, onSaved }) => {
  const toast = useToast();
  const today = toDateInput(new Date());
  const minDate = toDateInput(exit.noticeDate);
  const maxDate = toDateInput(new Date(new Date(exit.lastWorkingDay).getTime() - 86400000));
  const [lastWorkingDay, setLastWorkingDay] = useState(today < minDate ? minDate : today);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = lastWorkingDay && lastWorkingDay >= minDate && lastWorkingDay <= maxDate;
  const daysEarlier = valid
    ? differenceInCalendarDays(new Date(exit.lastWorkingDay), new Date(`${lastWorkingDay}T00:00:00`))
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid || !reason.trim()) return;
    setSaving(true);
    try {
      const res = await relieveEarly(exit._id, { lastWorkingDay, reason });
      toast.success(res.data.message);
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to relieve early');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-4 my-8 text-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FastForward className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Relieve early • {exit.snapshot.name}
              </h3>
              <p className="theme-muted">Current last working day: {fmt(exit.lastWorkingDay)}</p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        {minDate > maxDate ? (
          <p className="theme-muted">The last working day is already the earliest possible date.</p>
        ) : (
          <>
            <div>
              <label className="theme-label" htmlFor="newLwd">New last working day</label>
              <input
                id="newLwd"
                type="date"
                value={lastWorkingDay}
                min={minDate}
                max={maxDate}
                onChange={(e) => setLastWorkingDay(e.target.value)}
                className="theme-input w-full"
                required
              />
              {valid && (
                <p className="theme-muted mt-1">
                  {daysEarlier} day{daysEarlier === 1 ? '' : 's'} earlier than agreed.
                  {lastWorkingDay < today
                    ? ' The account will be deactivated right away.'
                    : ' The account stays active until this day.'}
                </p>
              )}
            </div>

            <div>
              <label className="theme-label" htmlFor="relieveReason">Reason</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`px-2 py-1 rounded-full border text-[11px] ${
                      reason === r
                        ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-slate-700 theme-muted hover:border-brand-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                id="relieveReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                required
                className="theme-input w-full resize-none"
                placeholder="Pick one above or write your own"
              />
            </div>

            <p className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200">
              {exit.snapshot.name} and their manager will be notified by email. The originally agreed date (
              {fmt(exit.originalLastWorkingDay || exit.lastWorkingDay)}) stays on record.
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving || !valid || !reason.trim()} className="btn-primary">
            <FastForward className="w-4 h-4" /> {saving ? 'Saving…' : 'Relieve early'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RelieveEarlyModal;
