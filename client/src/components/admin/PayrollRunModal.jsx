import React, { useState } from 'react';
import { PlayCircle, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../common/Tooltip';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

/**
 * Runs payroll for a whole month in one action.
 *
 * Always previews first: HR sees every payslip, every loss-of-pay deduction and
 * everyone being skipped, before a single record is written.
 */
const PayrollRunModal = ({ month, year, onClose, onComplete }) => {
  const toast = useToast();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const loadPreview = async () => {
    try {
      setLoading(true);
      const res = await api.post('/payroll/run', { month, year, dryRun: true });
      if (res.data.success) setPreview(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to build payroll preview');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const handleCommit = async () => {
    try {
      setCommitting(true);
      const res = await api.post('/payroll/run', { month, year, dryRun: false });
      if (res.data.success) {
        toast.success(res.data.message);
        onComplete?.();
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payroll run failed');
    } finally {
      setCommitting(false);
    }
  };

  const ready = preview?.payslips || [];
  const skipped = preview?.skipped || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-3xl w-full p-6 shadow-soft space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Run Payroll — {MONTHS[month - 1]} {year}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Preview first. Nothing is saved until you confirm.
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

        {loading ? (
          <div className="p-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Building preview from salary structures, attendance and leave...
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Payslips ready', ready.length, 'text-slate-900 dark:text-white'],
                ['Total gross', inr(preview?.totals?.gross), 'text-slate-900 dark:text-white'],
                ['Loss of pay', `− ${inr(preview?.totals?.lop)}`, 'text-rose-600 dark:text-rose-400'],
                ['Total net', inr(preview?.totals?.net), 'text-emerald-600 dark:text-emerald-400'],
              ].map(([label, value, tone]) => (
                <div
                  key={label}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800"
                >
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">
                    {label}
                  </div>
                  <div className={`text-sm font-black mt-0.5 ${tone}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Ready list */}
            {ready.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  Will be generated ({ready.length})
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {ready.map((p) => (
                    <div
                      key={p.userId}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {p.employeeName}
                          <span className="ml-2 text-[10px] font-medium text-slate-400">
                            {p.employeeId}
                          </span>
                        </div>
                        {p.lop.lopDays > 0 && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                            {p.lop.lopDays} LOP day(s) — {p.lop.unpaidLeaveDays} unpaid leave
                            {p.lop.absentDays > 0 ? `, ${p.lop.absentDays} absent` : ''} · day rate{' '}
                            {inr(p.lop.dayRate)}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                          gross {inr(p.grossSalary)}
                          {p.lop.lopAmount > 0 && (
                            <span className="text-rose-500"> − {inr(p.lop.lopAmount)}</span>
                          )}
                        </div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {inr(p.netSalary)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped list */}
            {skipped.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="px-4 py-2 text-[11px] font-bold text-amber-700 dark:text-amber-300 border-b border-amber-500/25 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Skipped ({skipped.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-amber-500/10">
                  {skipped.map((sk, i) => (
                    <div key={i} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {sk.employeeName}
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        {sk.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ready.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                Nothing to generate for {MONTHS[month - 1]} {year}.
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing || ready.length === 0}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                {committing ? 'Generating...' : `Generate ${ready.length} payslip(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PayrollRunModal;
