import React, { useState } from 'react';
import { IndianRupee, Eye, EyeOff, Edit2, Plus } from 'lucide-react';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * Salary lives on the profile, not the dashboard. The figure stays masked until
 * the viewer asks to see it, so it isn't on screen by default.
 *
 * Pass `onEditCtc` (HR only) to show the Add / Revise CTC action.
 */
const SalaryCard = ({ salary, onEditCtc, editDisabled = false }) => {
  // Each amount is revealed on its own, so only the figure asked for is on screen.
  const [revealed, setRevealed] = useState({ ctc: false, monthly: false });
  const toggle = (key) => setRevealed((r) => ({ ...r, [key]: !r[key] }));
  const annualCtc = Number(salary?.annualCtc) || 0;
  // Monthly pay is annual CTC / 12 — the same rule payroll uses.
  const monthly = annualCtc / 12;
  const mask = '₹ • • • • • •';

  return (
    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card space-y-5 transition-colors">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            Salary
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {onEditCtc && (
            <button
              type="button"
              onClick={onEditCtc}
              disabled={editDisabled}
              className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              {annualCtc > 0 ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {annualCtc > 0 ? 'Edit CTC' : 'Add CTC'}
            </button>
          )}
        </div>
      </div>

      {annualCtc > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="block text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Annual CTC
            </span>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {revealed.ctc ? inr(annualCtc) : mask}
              </span>
              <button
                type="button"
                onClick={() => toggle('ctc')}
                title={revealed.ctc ? 'Hide' : 'Show'}
                aria-label={revealed.ctc ? 'Hide amount' : 'Show amount'}
                className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-brand-400 dark:hover:bg-slate-700 transition-colors"
              >
                {revealed.ctc ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="block text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Monthly Salary
            </span>
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {revealed.monthly ? inr(monthly) : mask}
              </span>
              <button
                type="button"
                onClick={() => toggle('monthly')}
                title={revealed.monthly ? 'Hide' : 'Show'}
                aria-label={revealed.monthly ? 'Hide amount' : 'Show amount'}
                className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-brand-400 dark:hover:bg-slate-700 transition-colors"
              >
                {revealed.monthly ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="block text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Effective From
            </span>
            <span className="block text-lg font-black text-slate-900 dark:text-white mt-1">
              {salary?.effectiveFrom
                ? new Date(salary.effectiveFrom).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '-'}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No CTC on record yet.{onEditCtc ? '' : ' Please contact HR.'}
        </p>
      )}
    </div>
  );
};

export default SalaryCard;
