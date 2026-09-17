import React, { useState, useEffect } from 'react';
import { CalendarHeart, Plus, Trash2, Pencil, X } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';

const TYPES = ['Public', 'Restricted', 'Company'];

const typeStyle = (type) => {
  if (type === 'Restricted') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25';
  }
  if (type === 'Company') {
    return 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/25';
  }
  return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25';
};

/**
 * The company holiday calendar.
 *
 * Holidays feed attendance (shown as Holiday, not Absent), leave (never charged
 * against a balance) and payroll (never docked), so this is the single place
 * they are defined.
 */
const HolidayCalendarPanel = () => {
  const toast = useToast();
  const [holidays, setHolidays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', date: '', type: 'Public', description: '', departments: [] });

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const res = await api.get('/holidays', { params: { year } });
      if (res.data.success) setHolidays(res.data.holidays || []);
    } catch (err) {
      toast.error('Failed to load the holiday calendar');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      if (res.data.success) setDepartments(res.data.departments || []);
    } catch (err) {
      // Non-fatal — the department scope picker just stays empty.
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', date: '', type: 'Public', description: '', departments: [] });
    setShowModal(true);
  };

  const openEdit = (holiday) => {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      description: holiday.description || '',
      departments: holiday.departments || [],
    });
    setShowModal(true);
  };

  const toggleDepartment = (name) => {
    setForm((prev) => ({
      ...prev,
      departments: prev.departments.includes(name)
        ? prev.departments.filter((d) => d !== name)
        : [...prev.departments, name],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.date) {
      toast.error('Please provide a name and a date.');
      return;
    }
    try {
      const res = editing
        ? await api.put(`/holidays/${editing._id}`, form)
        : await api.post('/holidays', form);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowModal(false);
        fetchHolidays();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save holiday');
    }
  };

  const handleDelete = async (holiday) => {
    if (!window.confirm(`Remove ${holiday.name} from the holiday calendar?`)) return;
    try {
      const res = await api.delete(`/holidays/${holiday._id}`);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchHolidays();
      }
    } catch (err) {
      toast.error('Failed to remove holiday');
    }
  };

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';

  const years = [year - 1, year, year + 1];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <CalendarHeart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Holiday Calendar</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Not marked absent, not charged as leave, never docked from pay
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/80 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Holiday
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-400 text-xs">Loading holidays...</div>
      ) : holidays.length === 0 ? (
        <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          No holidays set for {year}. Without them, festival days count as Absent and cost
          employees a day of leave.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {holidays.map((h) => (
            <div
              key={h._id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                h.date < todayStr
                  ? 'bg-slate-50/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-60'
                  : 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {h.name}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${typeStyle(
                      h.type
                    )}`}
                  >
                    {h.type}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {h.departments && h.departments.length > 0
                    ? h.departments.join(', ')
                    : 'All Departments'}
                </div>
                {h.description && (
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{h.description}</div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(h)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(h)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Holiday' : 'Add Holiday'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={label}>Holiday name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Diwali"
                  className={field}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Date *</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className={field}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 -mt-2">
                Restricted holidays are optional — they are listed but do not close the office.
              </p>

              <div>
                <label className={label}>Applies to</label>
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, departments: [] })}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                      form.departments.length === 0
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    All Departments
                  </button>
                  {departments.map((d) => (
                    <button
                      key={d._id}
                      type="button"
                      onClick={() => toggleDepartment(d.name)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                        form.departments.includes(d.name)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Leave on "All Departments", or pick one or more to scope this holiday to just those teams.
                </p>
              </div>

              <div>
                <label className={label}>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional note"
                  className={field}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
                >
                  {editing ? 'Save Changes' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HolidayCalendarPanel;
