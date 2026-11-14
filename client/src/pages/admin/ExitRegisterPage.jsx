import React, { useState, useEffect, useMemo } from 'react';
import { UserMinus, Search, Download, Edit2, Undo2, Hourglass, LogOut, CalendarX2, FastForward } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { fetchExits, withdrawExit, EXIT_TYPES, noticeDateLabel } from '../../api/exits';
import RecordExitModal from '../../components/admin/RecordExitModal';
import ResignationRequestsPanel from '../../components/admin/ResignationRequestsPanel';
import RelieveEarlyModal from '../../components/admin/RelieveEarlyModal';

const STATUSES = ['Serving Notice', 'Exited', 'Withdrawn'];

const STATUS_STYLES = {
  'Serving Notice': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  Exited: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
  Withdrawn: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25',
};

const fmt = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const ExitRegisterPage = () => {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [exits, setExits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [year, setYear] = useState('');
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [pickedId, setPickedId] = useState('');
  const [recordFor, setRecordFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [relieving, setRelieving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchExits();
      setExits(res.data.exits || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load the exit register');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = () =>
    api
      .get('/users', { params: { status: 'Active' } })
      .then((res) => setActiveEmployees(res.data.employees || []))
      .catch(() => {});

  useEffect(() => {
    load();
    loadEmployees();
  }, []);

  const pendingIds = useMemo(
    () => new Set(exits.filter((e) => e.status === 'Serving Notice').map((e) => e.employee?._id)),
    [exits]
  );
  const pickable = activeEmployees
    .filter((e) => !pendingIds.has(e._id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const years = useMemo(
    () => [...new Set([thisYear, ...exits.map((e) => new Date(e.lastWorkingDay).getFullYear())])].sort((a, b) => b - a),
    [exits]
  );

  const visible = exits.filter((e) => {
    if (status && e.status !== status) return false;
    if (type && e.exitType !== type) return false;
    if (year && new Date(e.lastWorkingDay).getFullYear() !== Number(year)) return false;
    if (search) {
      const q = search.toLowerCase();
      const s = e.snapshot;
      if (![s.name, s.employeeId, s.email, s.department, s.designation].some((v) => v?.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });

  const stats = {
    serving: exits.filter((e) => e.status === 'Serving Notice').length,
    exitedThisYear: exits.filter(
      (e) => e.status === 'Exited' && new Date(e.lastWorkingDay).getFullYear() === thisYear
    ).length,
    resigned: exits.filter((e) => e.status !== 'Withdrawn' && e.exitType === 'Resigned').length,
    terminated: exits.filter((e) => e.status !== 'Withdrawn' && e.exitType === 'Terminated').length,
  };

  const refresh = () => {
    load();
    loadEmployees();
  };

  const handleWithdraw = async (exit) => {
    if (!window.confirm(`Withdraw the exit for ${exit.snapshot.name}? They will stay active.`)) return;
    setBusyId(exit._id);
    try {
      const res = await withdrawExit(exit._id);
      toast.success(res.data.message);
      refresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to withdraw the exit');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const header = [
      'Employee ID', 'Name', 'Email', 'Department', 'Designation', 'Joining date', 'Exit type',
      'Resignation / termination date', 'Last working day', 'Originally agreed last day', 'Relieved early reason', 'Status', 'Reason', 'Recorded by', 'Recorded on',
    ];
    const rows = visible.map((e) => [
      e.snapshot.employeeId, e.snapshot.name, e.snapshot.email, e.snapshot.department, e.snapshot.designation,
      fmt(e.snapshot.joiningDate), e.exitType, fmt(e.noticeDate), fmt(e.lastWorkingDay), e.originalLastWorkingDay ? fmt(e.originalLastWorkingDay) : '', e.earlyReliefReason || '', e.status,
      e.reason, e.recordedBy?.name || '', fmt(e.createdAt),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exit_Register_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: 'Serving notice', value: stats.serving, icon: Hourglass, tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', onClick: () => setStatus('Serving Notice') },
    { label: `Exited in ${thisYear}`, value: stats.exitedThisYear, icon: LogOut, tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10', onClick: () => { setStatus('Exited'); setYear(String(thisYear)); } },
    { label: 'Resigned (all time)', value: stats.resigned, icon: UserMinus, tone: 'text-sky-600 dark:text-sky-400 bg-sky-500/10', onClick: () => setType('Resigned') },
    { label: 'Terminated (all time)', value: stats.terminated, icon: CalendarX2, tone: 'text-slate-600 dark:text-slate-300 bg-slate-500/10', onClick: () => setType('Terminated') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Exits</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Everyone who has resigned, been terminated or left — with their last working day.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="theme-input text-xs max-w-[14rem]"
            aria-label="Employee to record an exit for"
          >
            <option value="">Select employee…</option>
            {pickable.map((e) => (
              <option key={e._id} value={e._id}>{e.name} · {e.employeeId}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickedId}
            onClick={() => setRecordFor(activeEmployees.find((e) => e._id === pickedId))}
            className="btn-primary"
          >
            <UserMinus className="w-4 h-4" /> Record exit
          </button>
        </div>
      </div>

      <ResignationRequestsPanel onDecided={refresh} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, icon: Icon, tone, onClick }) => (
          <button key={label} type="button" onClick={onClick} className="theme-card p-4 flex items-center gap-3 text-left hover:shadow-soft transition-shadow">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</div>
              <div className="text-[11px] theme-muted truncate">{label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="theme-card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, ID, department…"
                className="theme-input text-xs pl-8 w-56"
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="theme-input text-xs" aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} className="theme-input text-xs" aria-label="Exit type">
              <option value="">All types</option>
              {EXIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(e.target.value)} className="theme-input text-xs" aria-label="Year of last working day">
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {(search || status || type || year) && (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatus(''); setType(''); setYear(''); }}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] theme-muted">{visible.length} of {exits.length}</span>
            <button type="button" onClick={exportCsv} disabled={!visible.length} className="btn-secondary !py-1.5 !text-xs">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 whitespace-nowrap">Resigned / terminated on</th>
                <th className="px-4 py-3 whitespace-nowrap">Last working day</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center theme-muted">Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center theme-muted">
                    {exits.length ? 'No exits match these filters.' : 'No exits recorded yet.'}
                  </td>
                </tr>
              ) : (
                visible.map((e) => {
                  const s = e.snapshot;
                  const daysLeft = differenceInCalendarDays(new Date(e.lastWorkingDay), new Date());
                  return (
                    <tr key={e._id} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{s.name}</div>
                        <div className="text-[11px] theme-muted">{s.employeeId} · {s.designation}</div>
                        <div className="text-[11px] theme-muted">{s.department} · joined {fmt(s.joiningDate)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{e.exitType}</td>
                      <td className="px-4 py-3 whitespace-nowrap" title={noticeDateLabel(e.exitType)}>{fmt(e.noticeDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">{fmt(e.lastWorkingDay)}</div>
                        {e.originalLastWorkingDay && (
                          <div className="text-[11px] theme-muted" title={`Relieved early: ${e.earlyReliefReason}`}>
                            <span className="line-through">{fmt(e.originalLastWorkingDay)}</span>
                            <span className="ml-1 inline-flex px-1.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">Relieved early</span>
                          </div>
                        )}
                        {e.status === 'Serving Notice' && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-300">
                            {daysLeft === 0 ? 'Today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[e.status]}`}>
                          {e.status}
                        </span>
                        {e.status === 'Exited' && e.employee?.status === 'Active' && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1">Reactivated since</div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-slate-600 dark:text-slate-300 whitespace-pre-line break-words">{e.reason || '—'}</div>
                        <div className="text-[10px] theme-muted mt-1">
                          Recorded by {e.recordedBy?.name || 'HR'} on {fmt(e.createdAt)}
                          {e.withdrawnAt && ` · withdrawn by ${e.withdrawnBy?.name || 'HR'} on ${fmt(e.withdrawnAt)}`}
                        </div>
                        {e.relievedEarlyAt && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                            Relieved early by {e.relievedEarlyBy?.name || 'HR'} on {fmt(e.relievedEarlyAt)}: {e.earlyReliefReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {e.status !== 'Withdrawn' && (
                            <button type="button" onClick={() => setEditing(e)} className="btn-icon" title="Edit" aria-label={`Edit exit for ${s.name}`}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {e.status === 'Serving Notice' && (
                            <button
                              type="button"
                              onClick={() => setRelieving(e)}
                              className="btn-icon text-brand-600 dark:text-brand-400"
                              title="Relieve early"
                              aria-label={`Relieve ${s.name} early`}
                            >
                              <FastForward className="w-4 h-4" />
                            </button>
                          )}
                          {e.status === 'Serving Notice' && (
                            <button
                              type="button"
                              onClick={() => handleWithdraw(e)}
                              disabled={busyId === e._id}
                              className="btn-icon text-amber-600 dark:text-amber-400"
                              title="Withdraw (resignation taken back)"
                              aria-label={`Withdraw exit for ${s.name}`}
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {recordFor && (
        <RecordExitModal
          employee={recordFor}
          onClose={() => setRecordFor(null)}
          onSaved={() => { setPickedId(''); refresh(); }}
        />
      )}
      {relieving && <RelieveEarlyModal exit={relieving} onClose={() => setRelieving(null)} onSaved={refresh} />}
      {editing && <RecordExitModal exit={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
};

export default ExitRegisterPage;
