import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Check,
  Calendar,
  Filter,
  Search,
  Paperclip,
  Download,
  AlertCircle,
  TrendingUp,
  Receipt,
  Building2,
  BarChart3,
} from 'lucide-react';
import api from '../../api/client';
import { downloadExpenseDocument, readBlobError } from '../../api/files';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../../components/common/Tooltip';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MAX_FILES = 5;
const MAX_FILE_MB = 5;

const inr = (n) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// A new entry defaults to today when looking at the current month, otherwise
// to the 1st of the month being viewed.
const defaultDateFor = (month, year) => {
  const now = new Date();
  if (now.getMonth() + 1 === month && now.getFullYear() === year) {
    return `${year}-${pad(month)}-${pad(now.getDate())}`;
  }
  return `${year}-${pad(month)}-01`;
};

const emptyForm = (month, year) => ({
  category: '',
  description: '',
  amount: '',
  expenseDate: defaultDateFor(month, year),
});

const MiscExpensesPage = () => {
  const toast = useToast();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [search, setSearch] = useState('');

  const [expenses, setExpenses] = useState([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState({ months: [], yearTotal: 0 });
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = create
  const [form, setForm] = useState(emptyForm(selectedMonth, selectedYear));
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() + 1 - i);

  const fetchMonth = async () => {
    try {
      setLoading(true);
      const params = { month: selectedMonth, year: selectedYear };
      if (categoryFilter !== 'All') params.category = categoryFilter;
      if (search.trim()) params.search = search.trim();

      const [listRes, summaryRes] = await Promise.all([
        api.get('/misc-expenses', { params }),
        api.get('/misc-expenses/summary', { params: { month: selectedMonth, year: selectedYear } }),
      ]);
      if (listRes.data.success) {
        setExpenses(listRes.data.expenses);
        setMonthTotal(listRes.data.total);
        setCategories(listRes.data.categories || []);
      }
      if (summaryRes.data.success) setSummary(summaryRes.data.summary);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchYear = async () => {
    try {
      const res = await api.get('/misc-expenses/monthly', { params: { year: selectedYear } });
      if (res.data.success) setMonthly(res.data);
    } catch {
      // The month view still works without the yearly strip.
    }
  };

  const refresh = () => {
    fetchMonth();
    fetchYear();
  };

  useEffect(() => {
    fetchMonth();
  }, [selectedMonth, selectedYear, categoryFilter]);

  useEffect(() => {
    fetchYear();
  }, [selectedYear]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(fetchMonth, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(selectedMonth, selectedYear));
    setFiles([]);
    setShowModal(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setForm({
      category: expense.category,
      description: expense.description || '',
      amount: String(expense.amount),
      expenseDate: expense.expenseDate,
    });
    setFiles([]);
    setShowModal(true);
  };

  const existingCount = editing?.documents?.length || 0;

  const handleFilesPicked = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const tooBig = picked.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`'${tooBig.name}' is larger than ${MAX_FILE_MB} MB`);
      return;
    }
    const next = [...files, ...picked];
    if (existingCount + next.length > MAX_FILES) {
      toast.error(`You can attach up to ${MAX_FILES} files per expense`);
      return;
    }
    setFiles(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = new FormData();
      body.append('category', form.category);
      body.append('description', form.description);
      body.append('amount', form.amount);
      body.append('expenseDate', form.expenseDate);
      files.forEach((f) => body.append('documents', f));
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };

      const res = editing
        ? await api.put(`/misc-expenses/${editing._id}`, body, config)
        : await api.post('/misc-expenses', body, config);
      if (res.data.success) {
        toast.success(res.data.message);
        setShowModal(false);
        // Jump to the month the expense was filed under, so it is visible.
        const [y, m] = form.expenseDate.split('-').map(Number);
        if (y !== selectedYear || m !== selectedMonth) {
          setSelectedYear(y);
          setSelectedMonth(m);
        } else {
          refresh();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete the ${expense.category} expense of ${inr(expense.amount)}? This cannot be undone.`)) return;
    try {
      const res = await api.delete(`/misc-expenses/${expense._id}`);
      if (res.data.success) {
        toast.success(res.data.message);
        refresh();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete expense');
    }
  };

  const handleRemoveAttachment = async (doc) => {
    if (!editing || !window.confirm(`Remove '${doc.originalName}'?`)) return;
    try {
      const res = await api.delete(`/misc-expenses/${editing._id}/documents/${doc._id}`);
      if (res.data.success) {
        toast.success(res.data.message);
        setEditing(res.data.expense);
        fetchMonth();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove attachment');
    }
  };

  const handleDownload = async (expenseId, doc) => {
    try {
      await downloadExpenseDocument(expenseId, doc);
    } catch (err) {
      toast.error((await readBlobError(err)) || 'Failed to download file');
    }
  };

  const periodLabel = `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
  const maxMonthTotal = Math.max(1, ...monthly.months.map((m) => m.total));

  const summaryCards = [
    {
      label: 'Misc Expenses',
      value: summary?.misc.total ?? monthTotal,
      sub: `${summary?.misc.count ?? 0} entr${summary?.misc.count === 1 ? 'y' : 'ies'} this month`,
      icon: Wallet,
      tone: 'text-amber-600 dark:text-amber-400',
      iconTone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Payroll (Gross)',
      value: summary?.payroll.gross,
      sub: `${summary?.payroll.payslips ?? 0} payslips · ${inr(summary?.payroll.deductions)} deductions`,
      icon: TrendingUp,
      tone: 'text-slate-900 dark:text-white',
      iconTone: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    },
    {
      label: 'Reimbursements',
      value: summary?.reimbursements.total,
      sub: `${summary?.reimbursements.count ?? 0} approved`,
      icon: Receipt,
      tone: 'text-slate-900 dark:text-white',
      iconTone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Total Company Expense',
      value: summary?.totalCompanyExpense,
      sub: 'Payroll + reimbursements + misc',
      icon: Building2,
      tone: 'text-rose-600 dark:text-rose-400',
      iconTone: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Miscellaneous Expenses
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Record company running costs like rent, electricity and maintenance, and see what each month cost in total.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="theme-input text-xs"
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="theme-input text-xs"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="theme-input text-xs"
            >
              <option value="All">All Categories</option>
              {[...new Set([...categories, ...(summary?.misc.byCategory || []).map((c) => c.category)])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses..."
            className="theme-input text-xs w-full pl-8"
          />
        </div>
      </div>

      {/* Company expense summary for the month */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Company expense summary · {periodLabel}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">{card.label}</span>
                  <div className={`text-2xl font-black mt-1 ${card.tone}`}>{inr(card.value)}</div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">{card.sub}</span>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconTone}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </div>
        {summary?.misc.byCategory?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {summary.misc.byCategory.map((c) => (
              <span
                key={c.category}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300"
              >
                {c.category}: <span className="font-bold text-slate-900 dark:text-white">{inr(c.total)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expense list */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Loading...</span>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm">
              No expenses {categoryFilter !== 'All' || search ? 'match these filters' : 'recorded'} for {periodLabel}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Expense</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                  <th className="px-6 py-4">Slips</th>
                  <th className="px-6 py-4">Added By</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {expenses.map((exp) => (
                  <tr key={exp._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(exp.expenseDate)}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{exp.category}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-xs">{exp.description || '—'}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">{inr(exp.amount)}</td>
                    <td className="px-6 py-4">
                      {exp.documents?.length ? (
                        <div className="flex flex-col gap-1">
                          {exp.documents.map((doc) => (
                            <button
                              key={doc._id}
                              type="button"
                              onClick={() => handleDownload(exp._id, doc)}
                              className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300 hover:underline text-left max-w-[12rem]"
                              title={doc.originalName}
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{doc.originalName || 'Attachment'}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{exp.createdBy?.name || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip label="Edit expense" side="top">
                          <button
                            aria-label="Edit expense"
                            onClick={() => openEdit(exp)}
                            className="p-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600 text-brand-700 dark:text-brand-300 hover:text-white transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Delete expense" side="top">
                          <button
                            aria-label="Delete expense"
                            onClick={() => handleDelete(exp)}
                            className="p-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800">
                <tr>
                  <td colSpan={3} className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                    Total for {periodLabel}
                    {(categoryFilter !== 'All' || search) && ' (filtered)'}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">{inr(monthTotal)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Month-by-month records for the year */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm dark:shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-500" />
            Monthly Records · {selectedYear}
          </h4>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Year total: <span className="font-bold text-slate-900 dark:text-white">{inr(monthly.yearTotal)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {monthly.months.map((m) => {
            const active = m.month === selectedMonth;
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelectedMonth(m.month)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-brand-500/40'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{MONTHS[m.month - 1].slice(0, 3)}</div>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{inr(m.total)}</div>
                <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(m.total / maxMonthTotal) * 100}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{m.count} entr{m.count === 1 ? 'y' : 'ies'}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add / edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit Expense' : 'Add Expense'}
              </h3>
              <Tooltip label="Close" side="left">
                <button
                  aria-label="Close"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Expense Name / Category *</label>
                <input
                  type="text"
                  required
                  list="misc-expense-categories"
                  maxLength={100}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Building Rent"
                  className="theme-input w-full"
                />
                <datalist id="misc-expense-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Office rent for 3rd floor"
                  className="theme-input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="theme-input w-full"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={form.expenseDate}
                    onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                    className="theme-input w-full"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Counts towards this date&apos;s month.</p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bills / Receipts / Slips <span className="font-normal text-slate-400">(optional)</span>
                </label>
                {editing?.documents?.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {editing.documents.map((doc) => (
                      <li key={doc._id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => handleDownload(editing._id, doc)}
                          className="inline-flex items-center gap-1.5 text-brand-600 dark:text-brand-300 hover:underline truncate"
                        >
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{doc.originalName}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${doc.originalName}`}
                          onClick={() => handleRemoveAttachment(doc)}
                          className="text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {files.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-brand-500/10">
                        <span className="inline-flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200">
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-slate-400 shrink-0">{formatSize(f.size)}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setFiles(files.filter((_, j) => j !== i))}
                          className="text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {existingCount + files.length < MAX_FILES && (
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-500 hover:text-brand-600 cursor-pointer transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <span>Attach PDF or image</span>
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={handleFilesPicked}
                      className="hidden"
                    />
                  </label>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Up to {MAX_FILES} files, {MAX_FILE_MB} MB each. PDF, JPG, PNG or WEBP.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : editing ? (
                    <Save className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editing ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiscExpensesPage;
