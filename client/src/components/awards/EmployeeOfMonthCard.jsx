import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Download, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fetchAwards, downloadCertificate, readBlobError, MONTHS } from '../../api/awards';
import { buildInitialsAvatar } from '../../utils/initialsAvatar';

/**
 * The latest Employee of the Month winners, shown on every dashboard. Winners
 * see a highlight and can download their certificate. Renders nothing until
 * HR has named someone, except for admins, who get a prompt to do so.
 */
const EmployeeOfMonthCard = () => {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const myId = (user?._id || user?.id || '').toString();

  useEffect(() => {
    let active = true;
    fetchAwards()
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch(() => {
        // The card is a nice-to-have; a failed load just hides it.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDownload = async (award) => {
    setDownloading(award._id);
    try {
      await downloadCertificate(award);
    } catch (error) {
      toast.error((await readBlobError(error)) || 'Failed to download certificate');
    } finally {
      setDownloading(null);
    }
  };

  if (!data) return null;

  const awards = data.awards || [];

  if (awards.length === 0) {
    if (!isAdmin) return null;
    return (
      <div className="theme-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="theme-section-title">Employee of the Month</div>
            <p className="text-xs theme-muted">No winners named yet.</p>
          </div>
        </div>
        <Link to="/admin/awards" className="btn-primary">
          Name winners <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const period = `${MONTHS[data.month - 1]} ${data.year}`;

  return (
    <div className="theme-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-transparent border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Employee of the Month
            </h3>
            <p className="text-xs theme-muted">{period}</p>
          </div>
        </div>
        {isAdmin && (
          <Link
            to="/admin/awards"
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
          >
            Manage <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {awards.map((award) => {
          const emp = award.employee;
          const isMe = emp._id === myId;
          return (
            <div
              key={award._id}
              className={`p-4 rounded-xl border flex gap-3 ${
                isMe
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400/60'
                  : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800'
              }`}
            >
              <img
                src={emp.avatar || buildInitialsAvatar(emp.name)}
                alt=""
                className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{emp.name}</span>
                  {isMe && <span className="badge-warning">That's you! 🎉</span>}
                </div>
                <div className="text-[11px] theme-muted truncate">{emp.designation}</div>
                <span className="badge-brand mt-1.5">{award.department}</span>
                {award.citation && (
                  <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-300">“{award.citation}”</p>
                )}
                {isMe && (
                  <button
                    type="button"
                    onClick={() => handleDownload(award)}
                    disabled={downloading === award._id}
                    className="btn-primary mt-3 !py-1.5 !text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading === award._id ? 'Preparing…' : 'Download certificate'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmployeeOfMonthCard;
