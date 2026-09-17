import React, { useState, useEffect } from 'react';
import { IndianRupee, Save, Info } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

/**
 * Pay rules.
 *
 * Monthly pay is simply the annual CTC divided by 12 — no component split, no
 * PF, no professional tax, no TDS. The only settings here govern loss of pay.
 */
const SalaryStructurePanel = () => {
  const toast = useToast();
  const [structure, setStructure] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sampleCtc, setSampleCtc] = useState(1200000);

  useEffect(() => {
    api
      .get('/org-settings')
      .then((res) => {
        if (res.data.success) setStructure(res.data.settings.salaryStructure);
      })
      .catch(() => toast.error('Failed to load pay rules'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.put('/org-settings', { salaryStructure: structure });
      if (res.data.success) {
        toast.success('Pay rules saved.');
        setStructure(res.data.settings.salaryStructure);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save pay rules');
    } finally {
      setSaving(false);
    }
  };

  if (!structure) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
        Loading pay rules...
      </div>
    );
  }

  const monthly = Math.round(sampleCtc / 12);

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';
  const set = (key, value) => setStructure({ ...structure, [key]: value });

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <IndianRupee className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pay Rules</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Monthly pay is CTC ÷ 12 — loss of pay is the only deduction
          </p>
        </div>
      </div>

      {/* How pay is calculated */}
      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/25 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            How pay is calculated
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Annual CTC ₹</span>
            <input
              type="number"
              min="0"
              step="50000"
              value={sampleCtc}
              onChange={(e) => setSampleCtc(Number(e.target.value))}
              className="w-32 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="font-bold text-slate-900 dark:text-white">{inr(sampleCtc)}</span>
          <span className="text-slate-400">÷ 12 =</span>
          <span className="font-black text-emerald-700 dark:text-emerald-300 text-lg">
            {inr(monthly)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">per month</span>
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          No Basic / HRA split, no PF, no professional tax, no TDS or GST. What an employee
          is paid each month is exactly their CTC divided by twelve, less any loss of pay.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Loss-of-pay day rate</label>
            <select
              value={structure.lopBasis}
              onChange={(e) => set('lopBasis', e.target.value)}
              className={field}
            >
              <option value="calendarDays">Monthly pay ÷ calendar days in month</option>
              <option value="workingDays">Monthly pay ÷ working days in month</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {structure.lopBasis === 'workingDays'
                ? `e.g. ${inr(monthly)} ÷ 22 working days = ${inr(monthly / 22)}/day`
                : `e.g. ${inr(monthly)} ÷ 30 calendar days = ${inr(monthly / 30)}/day`}
            </p>
          </div>

          <div>
            <label className={label}>Absent days</label>
            <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={!!structure.countAbsentAsLop}
                onChange={(e) => set('countAbsentAsLop', e.target.checked)}
                className="w-4 h-4 rounded accent-brand-600"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Also deduct pay for absent days
              </span>
            </label>
            <p className="text-[10px] text-slate-400 mt-1">
              Off: only approved unpaid leave costs pay
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-2 shadow-glow disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Pay Rules'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SalaryStructurePanel;
