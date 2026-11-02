import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, X, Download, UploadCloud, Trash2, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { downloadIncentiveTemplate, uploadIncentiveSheet } from '../../api/files';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../common/Tooltip';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

/**
 * Upload a month's incentives from a sheet (Email + Incentive Amount) instead
 * of editing payslips one by one. The payroll run adds them to new payslips;
 * payslips that already exist are updated on upload.
 */
const IncentiveUploadModal = ({ month, year, onClose, onChange }) => {
  const toast = useToast();
  const [incentives, setIncentives] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadIncentives = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/incentives', { params: { month, year } });
      if (res.data.success) {
        setIncentives(res.data.incentives || []);
        setTotal(res.data.total || 0);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load incentives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncentives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      await downloadIncentiveTemplate();
    } catch {
      toast.error('Failed to download the template file');
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please choose a file to upload');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const res = await uploadIncentiveSheet(file, { month, year });
      if (res.data.success) {
        setResult(res.data);
        toast.success(res.data.message);
        setFile(null);
        loadIncentives();
        onChange?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload incentives');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (incentive) => {
    try {
      const res = await api.delete(`/payroll/incentives/${incentive._id}`);
      if (res.data.success) {
        toast.success(`Incentive removed for ${incentive.userId?.name || 'employee'}`);
        loadIncentives();
        onChange?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove incentive');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-soft space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Upload Incentives — {MONTHS[month - 1]} {year}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Added to this month's payslips when you run payroll.
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

        <div className="space-y-4 text-xs">
          {/* Step 1: template */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">1. Download the sheet</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                It lists every active employee. Fill in Incentive Amount only for those getting one —
                blank rows are ignored, 0 removes an earlier incentive. Your own sheet works too, as
                long as it has Email and Incentive Amount columns.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={templateLoading}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sheet
            </button>
          </div>

          {/* Step 2: upload */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-semibold text-slate-800 dark:text-slate-200">2. Upload the filled-in sheet</div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setResult(null);
                }}
                className="block flex-1 min-w-0 text-[11px] text-slate-600 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-500 file:text-white hover:file:bg-brand-600 file:cursor-pointer cursor-pointer"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !file}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50 shrink-0"
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                Upload
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Uploading again replaces that employee's incentive for this month. Payslips already
              generated for {MONTHS[month - 1]} are updated straight away.
            </p>
          </div>

          {/* Upload result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                  {result.savedCount} saved · {inr(result.total)}
                </span>
                {result.removedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/25">
                    {result.removedCount} removed
                  </span>
                )}
                {result.payslipsUpdated > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/25">
                    {result.payslipsUpdated} existing payslip(s) updated
                  </span>
                )}
                {result.failedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                    {result.failedCount} skipped
                  </span>
                )}
              </div>

              {result.failed?.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {result.failed.map((f, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-mono">{f.row}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{f.email || '—'}</td>
                          <td className="px-3 py-2 text-rose-600 dark:text-rose-400">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Current incentives for the month */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span>Incentives for {MONTHS[month - 1]} ({incentives.length})</span>
              <span className="text-violet-600 dark:text-violet-400">{inr(total)}</span>
            </div>
            {loading ? (
              <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : incentives.length === 0 ? (
              <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                No incentives uploaded for this month yet.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {incentives.map((inc) => (
                  <div key={inc._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {inc.userId?.name || 'Employee'}
                        <span className="ml-2 text-[10px] font-medium text-slate-400">
                          {inc.userId?.email}
                        </span>
                      </div>
                      {inc.remarks && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{inc.remarks}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
                        {inr(inc.amount)}
                      </span>
                      <Tooltip label="Remove incentive" side="left">
                        <button
                          type="button"
                          aria-label="Remove incentive"
                          onClick={() => handleRemove(inc)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncentiveUploadModal;
