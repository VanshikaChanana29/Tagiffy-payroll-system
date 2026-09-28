import React, { useState } from 'react';
import { Receipt, Paperclip, X, Check } from 'lucide-react';
import { submitReimbursement, MAX_RECEIPT_MB } from '../../api/files';
import { useToast } from '../../context/ToastContext';
import { format } from 'date-fns';
import Tooltip from '../common/Tooltip';

const CATEGORIES = ['Travel', 'Food', 'Accommodation', 'Office Supplies', 'Client Entertainment', 'Other'];

const SubmitReimbursementModal = ({ isOpen, onClose, onSuccess }) => {
  const [category, setCategory] = useState('Travel');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RECEIPT_MB * 1024 * 1024) {
      toast.error(`Receipt must be under ${MAX_RECEIPT_MB} MB`);
      e.target.value = '';
      return;
    }
    setReceipt(file);
  };

  const resetForm = () => {
    setCategory('Travel');
    setAmount('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setDescription('');
    setReceipt(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Please describe the expense');
      return;
    }
    if (!(Number(amount) > 0)) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitReimbursement({ category, amount, expenseDate, description, receipt });
      if (res.data.success) {
        toast.success(res.data.message);
        resetForm();
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit reimbursement request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Submit Reimbursement</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Claim an expense for HR approval</p>
            </div>
          </div>
          <Tooltip label="Close" side="left">
            <button aria-label="Close"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category *</label>
            <select
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="theme-input w-full"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1500"
                className="theme-input w-full"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Expense Date *</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="theme-input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Description *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Client visit cab fare, team lunch, courier charges..."
              className="theme-input w-full resize-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Receipt (PDF or image, optional)
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              <Paperclip className="w-4 h-4 shrink-0" />
              <span className="truncate">{receipt ? receipt.name : 'Attach a bill or invoice'}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-slate-400 mt-1">Max {MAX_RECEIPT_MB} MB. HR may reject claims without proof.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Check className="w-4 h-4" />
              )}
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitReimbursementModal;
