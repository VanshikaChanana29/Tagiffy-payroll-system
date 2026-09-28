import React, { useEffect, useState } from 'react';
import { Landmark, Eye, EyeOff, CheckCircle2, AlertTriangle, Clock, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import {
  getBankDetails,
  confirmBankDetails,
  requestBankCorrection,
  cancelBankCorrection,
  reviewBankCorrection,
  updateBankDetails,
} from '../../api/bankDetails';

const mask = (acc) => (acc ? `${'•'.repeat(Math.max(0, acc.length - 4))}${acc.slice(-4)}` : '');
const hasDetails = (bd) => !!(bd?.accountNumber && bd?.ifscCode && bd?.bankName);

const STATUS_STYLES = {
  Confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  Unconfirmed: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  'Correction Pending': 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25',
  Missing: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
};

const EMPTY_FORM = { accountNumber: '', confirmAccountNumber: '', ifscCode: '', bankName: '', reason: '' };

/**
 * Salary account details with the confirm / correction flow.
 * mode="self": the employee confirms, or asks HR to change them.
 * mode="hr":   HR reviews pending requests and can edit the details directly.
 */
const BankDetailsCard = ({ employeeId, mode = 'self' }) => {
  const toast = useToast();
  const [bd, setBd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const isHr = mode === 'hr';

  const load = async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const res = await getBankDetails(employeeId);
      setBd(res.data.bankDetails || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load bank details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const run = async (fn, after) => {
    try {
      setBusy(true);
      const res = await fn();
      setBd(res.data.bankDetails);
      toast.success(res.data.message);
      after?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const openForm = () => {
    // HR edits start from what is on record; an employee types fresh details.
    setForm(
      isHr && hasDetails(bd)
        ? { ...EMPTY_FORM, accountNumber: bd.accountNumber, confirmAccountNumber: bd.accountNumber, ifscCode: bd.ifscCode, bankName: bd.bankName }
        : EMPTY_FORM
    );
    setShowForm(true);
  };

  const submitForm = (e) => {
    e.preventDefault();
    if (form.accountNumber.replace(/[\s-]/g, '') !== form.confirmAccountNumber.replace(/[\s-]/g, '')) {
      toast.error('The two account numbers do not match.');
      return;
    }
    run(
      () => (isHr ? updateBankDetails(employeeId, form) : requestBankCorrection(employeeId, form)),
      () => setShowForm(false)
    );
  };

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
        Loading bank details…
      </div>
    );
  }

  const present = hasDetails(bd);
  const status = present || bd?.status === 'Correction Pending' ? bd?.status || 'Unconfirmed' : 'Missing';
  const pending = bd?.status === 'Correction Pending' ? bd.pendingChange : null;
  const statusLabel = {
    Confirmed: 'Confirmed',
    Unconfirmed: isHr ? 'Not confirmed by employee' : 'Please confirm',
    'Correction Pending': 'Change waiting for HR',
    Missing: 'Not added',
  }[status];

  const Row = ({ label, value, mono }) => (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-sm text-slate-900 dark:text-white ${mono ? 'font-mono' : 'font-semibold'}`}>{value || '—'}</div>
    </div>
  );

  return (
    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm dark:shadow-card transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Landmark className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          Salary Bank Account
        </h3>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[status]}`}>
          {statusLabel}
        </span>
      </div>

      {present ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Account Number</div>
            <div className="text-sm font-mono text-slate-900 dark:text-white flex items-center gap-2">
              {reveal ? bd.accountNumber : mask(bd.accountNumber)}
              <button
                type="button"
                aria-label={reveal ? 'Hide account number' : 'Show account number'}
                onClick={() => setReveal(!reveal)}
                className="text-slate-400 hover:text-brand-600"
              >
                {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <Row label="IFSC Code" value={bd.ifscCode} mono />
          <Row label="Bank Name" value={bd.bankName} />
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isHr
            ? 'No bank account on record. Add it here or ask the employee to submit it from their profile.'
            : 'Your salary account is not on record yet. Add it so HR can pay your salary.'}
        </p>
      )}

      {status === 'Confirmed' && bd.confirmedAt && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Confirmed on {format(new Date(bd.confirmedAt), 'dd MMM yyyy')}
        </p>
      )}

      {!isHr && status === 'Unconfirmed' && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          HR entered these details. Please check them carefully: your salary is paid to this account.
        </p>
      )}

      {bd?.reviewNote && status !== 'Correction Pending' && status !== 'Confirmed' && (
        <p className="text-[11px] text-rose-700 dark:text-rose-400">HR's note on your last request: {bd.reviewNote}</p>
      )}

      {pending && (
        <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/25 space-y-3">
          <div className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Requested change{pending.requestedAt ? ` · ${format(new Date(pending.requestedAt), 'dd MMM yyyy, hh:mm a')}` : ''}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Row label="New Account Number" value={isHr ? pending.accountNumber : mask(pending.accountNumber)} mono />
            <Row label="New IFSC Code" value={pending.ifscCode} mono />
            <Row label="New Bank Name" value={pending.bankName} />
          </div>
          {pending.reason && <p className="text-[11px] text-slate-600 dark:text-slate-400">Reason: {pending.reason}</p>}

          {isHr ? (
            rejecting ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Why is this rejected? The employee will see this."
                  className="theme-input w-full text-xs"
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setRejecting(false)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy || !rejectNote.trim()}
                    onClick={() => run(() => reviewBankCorrection(employeeId, 'reject', rejectNote), () => { setRejecting(false); setRejectNote(''); })}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => reviewBankCorrection(employeeId, 'approve'))}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Approve change
                </button>
              </div>
            )
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => cancelBankCorrection(employeeId))}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Cancel request
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!pending && (
        <div className="flex flex-wrap gap-2 justify-end">
          {!isHr && present && status !== 'Confirmed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => confirmBankDetails(employeeId))}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Details are correct
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={openForm}
            className="px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 text-xs font-semibold flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {isHr ? (present ? 'Edit details' : 'Add details') : present ? 'Request a correction' : 'Add bank details'}
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isHr ? 'Salary bank account' : present ? 'Request a correction' : 'Add bank details'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isHr
                    ? 'The employee will be asked to confirm these.'
                    : 'HR reviews this before your salary account changes.'}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitForm} className="space-y-3 text-xs">
              {[
                ['accountNumber', 'Account number *', 'e.g. 50100234567801', 'numeric'],
                ['confirmAccountNumber', 'Re-enter account number *', 'Type it again to avoid mistakes', 'numeric'],
                ['ifscCode', 'IFSC code *', 'e.g. HDFC0001234', 'text'],
                ['bankName', 'Bank name *', 'e.g. HDFC Bank', 'text'],
              ].map(([key, label, placeholder, inputMode]) => (
                <div key={key}>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
                  <input
                    required
                    inputMode={inputMode}
                    autoComplete="off"
                    onPaste={key === 'confirmAccountNumber' ? (e) => e.preventDefault() : undefined}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: key === 'ifscCode' ? e.target.value.toUpperCase() : e.target.value })}
                    placeholder={placeholder}
                    className="theme-input w-full"
                  />
                </div>
              ))}
              {!isHr && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Reason (optional)</label>
                  <input
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="e.g. Account number has a typo"
                    className="theme-input w-full"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="px-6 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-50">
                  {isHr ? 'Save' : 'Send to HR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankDetailsCard;
