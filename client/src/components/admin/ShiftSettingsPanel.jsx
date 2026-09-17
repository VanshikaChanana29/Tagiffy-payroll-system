import React, { useState, useEffect } from 'react';
import { Clock, Save, Timer, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';

const DAY_LABELS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/**
 * Shift timings and attendance rules. These drive late marks, half-day vs
 * full-day status, overtime, and which days count as weekends.
 */
const ShiftSettingsPanel = () => {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  // Shown after a save: existing records still carry the old numbers until
  // an admin chooses to reapply the rules.
  const [rulesChanged, setRulesChanged] = useState(false);

  useEffect(() => {
    api
      .get('/org-settings')
      .then((res) => {
        if (res.data.success) setSettings(res.data.settings);
      })
      .catch(() => toast.error('Failed to load work rules'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDay = (day) => {
    setSettings((prev) => {
      const days = prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day];
      return { ...prev, workingDays: days.sort() };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.put('/org-settings', {
        shiftStart: settings.shiftStart,
        shiftEnd: settings.shiftEnd,
        graceMinutes: Number(settings.graceMinutes),
        fullDayHours: Number(settings.fullDayHours),
        halfDayHours: Number(settings.halfDayHours),
        overtimeAfterHours: Number(settings.overtimeAfterHours),
        workingDays: settings.workingDays,
      });
      if (res.data.success) {
        toast.success(res.data.message);
        setSettings(res.data.settings);
        setRulesChanged(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save work rules');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    const confirmed = window.confirm(
      'Reapply the current shift rules to all existing attendance records?\n\n' +
        'This recalculates hours, late marks, overtime and day status from the ' +
        'stored punch times. It cannot be undone.'
    );
    if (!confirmed) return;

    try {
      setRecalculating(true);
      const res = await api.post('/attendance/recalculate');
      if (res.data.success) {
        toast.success(res.data.message);
        setRulesChanged(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to recalculate attendance');
    } finally {
      setRecalculating(false);
    }
  };

  if (!settings) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
        Loading work rules...
      </div>
    );
  }

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Shift Timings & Attendance Rules
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Drives late marks, day status, and overtime for every employee
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Shift Start</label>
            <input
              type="time"
              value={settings.shiftStart}
              onChange={(e) => setSettings({ ...settings, shiftStart: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Shift End</label>
            <input
              type="time"
              value={settings.shiftEnd}
              onChange={(e) => setSettings({ ...settings, shiftEnd: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Grace Period (min)</label>
            <input
              type="number"
              min="0"
              value={settings.graceMinutes}
              onChange={(e) => setSettings({ ...settings, graceMinutes: e.target.value })}
              className={field}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Late only after {settings.shiftStart} + {settings.graceMinutes} min
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Full Day (hours)</label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={settings.fullDayHours}
              onChange={(e) => setSettings({ ...settings, fullDayHours: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Half Day (hours)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={settings.halfDayHours}
              onChange={(e) => setSettings({ ...settings, halfDayHours: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>
              <span className="inline-flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Overtime After (hours)
              </span>
            </label>
            <input
              type="number"
              min="1"
              step="0.5"
              value={settings.overtimeAfterHours}
              onChange={(e) => setSettings({ ...settings, overtimeAfterHours: e.target.value })}
              className={field}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Hours beyond this count as overtime
            </p>
          </div>
        </div>

        <div>
          <label className={label}>Working Days</label>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((day) => {
              const active = settings.workingDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    active
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-400'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Days left unselected show as Weekend on every attendance calendar.
          </p>
        </div>

        {rulesChanged && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-200">
              <span className="font-bold">Rules saved.</span> New punches use them
              immediately. Attendance already recorded still shows the old late marks and
              overtime — history is never rewritten silently. Use{' '}
              <span className="font-bold">Reapply to past records</span> if you want the
              new rules applied to existing days.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Reapply to past records'}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Work Rules'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ShiftSettingsPanel;
