import React, { useState, useEffect } from 'react';
import { Inbox, Check, X } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { toDateInput } from '../../api/exits';
import {
  fetchResignations,
  acceptResignation,
  rejectResignation,
  resignationLabel,
  RESIGNATION_STYLES,
} from '../../api/resignations';

const fmt = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');

/** Accept (with a last working day) or reject one resignation. */
const DecisionModal = ({ resignation, mode, onClose, onDone }) => {
  const toast = useToast();
  const person = resignation.userId || {};
  const [lastWorkingDay, setLastWorkingDay] = useState(
    toDateInput(addDays(new Date(resignation.resignationDate), 30))
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const accepting = mode === 'accept';
  const minDate = toDateInput(resignation.resignationDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = accepting
        ? await acceptResignation(resignation._id, { lastWorkingDay, note })
        : await rejectResignation(resignation._id, { note });
      toast.success(res.data.message);
      onDone();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save the decision');
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
          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
            {accepting ? 'Accept' : 'Reject'} resignation • {person.name}
          </h3>
          <button type="button" aria-label="Close" onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="theme-muted">
          Resigned on <span className="font-semibold text-slate-800 dark:text-slate-100">{fmt(resignation.resignationDate)}</span>.
          Reason: {resignation.reason}
        </p>

        {accepting && (
          <div>
            <label className="theme-label" htmlFor="lwd">Last working day</label>
            <input
              id="lwd"
              type="date"
              value={lastWorkingDay}
              min={minDate}
              onChange={(e) => setLastWorkingDay(e.target.value)}
              className="theme-input w-full"
              required
            />
            <p className="theme-muted mt-1">
              Prefilled 30 days after the resignation date. Change it to match the notice period.
              {person.name} stays active until this day and is deactivated automatically after it.
            </p>
          </div>
        )}

        <div>
          <label className="theme-label" htmlFor="note">Note to the employee (optional)</label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            className="theme-input w-full resize-none"
            placeholder={accepting ? 'e.g. Please complete the handover by your last day.' : 'e.g. Let us discuss this in person.'}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            type="submit"
            disabled={saving || (accepting && (!lastWorkingDay || lastWorkingDay < minDate))}
            className={accepting ? 'btn-primary' : 'btn-secondary text-rose-600 dark:text-rose-400'}
          >
            {accepting ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {saving ? 'Saving…' : accepting ? 'Accept resignation' : 'Reject resignation'}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * Resignations employees submitted from the portal. HR sees everyone's; a
 * manager sees their direct reports'. Pending ones are listed first with
 * accept / reject; decided ones can be shown with "Show decided".
 */
const ResignationRequestsPanel = ({ onDecided }) => {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDecided, setShowDecided] = useState(false);
  const [deciding, setDeciding] = useState(null);

  const load = async () => {
    try {
      const res = await fetchResignations();
      setList(res.data.resignations || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load resignations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pending = list.filter((r) => r.status === 'Pending');
  const visible = showDecided ? list : pending;
  const myId = user?._id || user?.id;

  // Mirrors the server: an admin's resignation is a super admin's call.
  const canDecide = (r) => {
    const p = r.userId;
    if (!p || p._id === myId) return false;
    if (isAdmin) return !['admin', 'super_admin'].includes(p.role) || user.role === 'super_admin';
    return true;
  };

  return (
    <div className="theme-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Resignation requests</h3>
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
              {pending.length} pending
            </span>
          )}
        </div>
        {list.length > pending.length && (
          <button
            type="button"
            onClick={() => setShowDecided((v) => !v)}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            {showDecided ? 'Show pending only' : 'Show decided'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs theme-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs theme-muted">No resignations waiting for a decision.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
          {visible.map((r) => {
            const p = r.userId || {};
            const label = resignationLabel(r);
            return (
              <li key={r._id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {p.name} <span className="font-normal theme-muted">· {p.employeeId} · {p.designation || p.department}</span>
                  </div>
                  <div className="theme-muted">
                    Resigned on {fmt(r.resignationDate)} · submitted {fmt(r.createdAt)}
                    {r.lastWorkingDay && ` · last working day ${fmt(r.lastWorkingDay)}`}
                  </div>
                  <div className="text-slate-700 dark:text-slate-200 whitespace-pre-line break-words mt-1">{r.reason}</div>
                  {r.decidedBy && (
                    <div className="text-[11px] theme-muted mt-1">
                      {r.status} by {r.decidedBy.name} on {fmt(r.decidedAt)}
                      {r.decisionNote && ` · ${r.decisionNote}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'Pending' && canDecide(r) ? (
                    <>
                      <button type="button" onClick={() => setDeciding({ r, mode: 'reject' })} className="btn-secondary !py-1.5 !text-xs">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button type="button" onClick={() => setDeciding({ r, mode: 'accept' })} className="btn-primary !py-1.5 !text-xs">
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                    </>
                  ) : (
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${RESIGNATION_STYLES[label] || RESIGNATION_STYLES.Pending}`}>
                      {label}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {deciding && (
        <DecisionModal
          resignation={deciding.r}
          mode={deciding.mode}
          onClose={() => setDeciding(null)}
          onDone={() => {
            load();
            onDecided?.();
          }}
        />
      )}
    </div>
  );
};

export default ResignationRequestsPanel;
