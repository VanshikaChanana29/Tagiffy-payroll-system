import React, { useState, useEffect } from 'react';
import {
  DoorOpen,
  Send,
  Undo2,
  CalendarDays,
  CalendarCheck2,
  Users,
  Check,
  Quote,
  MessageSquare,
  Info,
  History,
  FastForward,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import { toDateInput } from '../../api/exits';
import {
  submitResignation,
  fetchMyResignations,
  withdrawResignation,
  resignationLabel,
  RESIGNATION_STYLES,
} from '../../api/resignations';

const fmt = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');

const StatusPill = ({ r }) => {
  const label = resignationLabel(r);
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap ${
        RESIGNATION_STYLES[label] || RESIGNATION_STYLES.Pending
      }`}
    >
      {label === 'Pending' ? 'Waiting for approval' : label}
    </span>
  );
};

/** Submitted → Under review → Accepted → Last working day. */
const Stepper = ({ r }) => {
  const steps = [
    { label: 'Submitted', date: r.createdAt },
    { label: 'Under review', date: null },
    { label: 'Accepted', date: r.status === 'Accepted' ? r.decidedAt : null },
    { label: 'Last working day', date: r.lastWorkingDay },
  ];
  // How many steps are done.
  const done = r.status === 'Pending' ? 1 : r.exitStatus === 'Exited' ? 4 : 3;

  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => {
        const complete = i < done;
        const current = i === done;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-3.5 right-1/2 w-full h-0.5 -z-0 ${
                  i <= done ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
            <span
              className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                complete
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : current
                    ? 'bg-white dark:bg-slate-900 border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              {complete ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <span
              className={`mt-2 text-[11px] font-semibold ${
                complete || current ? 'text-slate-900 dark:text-white' : 'text-slate-400'
              }`}
            >
              {s.label}
            </span>
            <span className="text-[10px] theme-muted">{s.date ? fmt(s.date) : current ? 'In progress' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
};

const Tile = ({ icon: Icon, label, children }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3.5">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider theme-muted">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
    <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{children}</div>
  </div>
);

const NEXT_STEPS = [
  { title: 'You submit', text: 'Pick your resignation date and share the reason.' },
  { title: 'HR & manager are emailed', text: 'Your reporting manager and HR get the request right away.' },
  { title: 'Last working day is set', text: 'One of them accepts it and confirms your last working day as per the notice period.' },
  { title: 'Serve notice & hand over', text: 'Your account stays active until the last working day, then closes automatically.' },
];

/**
 * An employee submits their resignation here instead of by email. HR and their
 * reporting manager get an in-app notification and an email, and one of them
 * accepts it with a last working day (or rejects it).
 */
const MyResignationPage = () => {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ resignationDate: toDateInput(new Date()), reason: '' });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await fetchMyResignations();
      setList(res.data.resignations || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load your resignation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // A pending request, or an accepted one still in its notice period, blocks a new one.
  const open = list.find(
    (r) => r.status === 'Pending' || (r.status === 'Accepted' && r.exitStatus === 'Serving Notice')
  );
  const history = list.filter((r) => r !== open);

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setConfirming(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    try {
      const res = await submitResignation(form);
      toast.success(res.data.message);
      setForm({ resignationDate: toDateInput(new Date()), reason: '' });
      setConfirming(false);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit your resignation');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async (r) => {
    if (!window.confirm('Withdraw your resignation? HR and your manager will be told.')) return;
    setBusyId(r._id);
    try {
      const res = await withdrawResignation(r._id);
      toast.success(res.data.message);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to withdraw your resignation');
    } finally {
      setBusyId(null);
    }
  };

  const renderOpen = (r) => {
    const manager = r.userId?.reportingManager;
    const daysLeft = r.lastWorkingDay ? differenceInCalendarDays(new Date(r.lastWorkingDay), new Date()) : null;
    const noticeDays = r.lastWorkingDay
      ? differenceInCalendarDays(new Date(r.lastWorkingDay), new Date(r.resignationDate))
      : null;
    const pending = r.status === 'Pending';

    return (
      <div className="theme-card overflow-hidden">
        <div className="p-5 sm:p-6 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                pending ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {pending ? 'Your resignation is under review' : 'Your resignation has been accepted'}
              </h3>
              <p className="text-xs theme-muted">
                {pending
                  ? `Submitted on ${fmt(r.createdAt)}. You'll be notified once it's reviewed.`
                  : `Accepted by ${r.decidedBy?.name || 'HR'} on ${fmt(r.decidedAt)}.`}
              </p>
            </div>
          </div>
          <StatusPill r={r} />
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          <Stepper r={r} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Tile icon={CalendarDays} label="Resignation date">{fmt(r.resignationDate)}</Tile>
            <Tile icon={CalendarCheck2} label="Last working day">
              {r.lastWorkingDay ? (
                <>
                  {fmt(r.lastWorkingDay)}
                  <div className="text-[11px] font-normal theme-muted">
                    {r.originalLastWorkingDay ? (
                      <>
                        Originally <span className="line-through">{fmt(r.originalLastWorkingDay)}</span>
                      </>
                    ) : (
                      `${noticeDays} day notice period`
                    )}
                  </div>
                </>
              ) : (
                <span className="font-normal theme-muted">To be confirmed</span>
              )}
            </Tile>
            <Tile icon={Users} label="Sent to">
              {manager?.name || 'HR team'}
              <div className="text-[11px] font-normal theme-muted">{manager ? 'Reporting manager & HR' : 'All HR admins'}</div>
            </Tile>
          </div>

          {daysLeft !== null && daysLeft >= 0 && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{daysLeft}</div>
              <div className="text-xs text-amber-900 dark:text-amber-100">
                {daysLeft === 0 ? (
                  <span className="font-semibold">Today is your last working day.</span>
                ) : (
                  <>
                    <span className="font-semibold">day{daysLeft === 1 ? '' : 's'} left</span> of your notice period.
                    Please complete your handover before {fmt(r.lastWorkingDay)}.
                  </>
                )}
              </div>
            </div>
          )}

          <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 p-4 pl-11">
            <Quote className="w-4 h-4 absolute left-4 top-4 text-slate-300 dark:text-slate-600" />
            <div className="text-[11px] font-semibold uppercase tracking-wider theme-muted mb-1">Your reason</div>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">{r.reason}</p>
          </div>

          {r.earlyReliefReason && (
            <div className="relative rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 pl-11">
              <FastForward className="w-4 h-4 absolute left-4 top-4 text-amber-600 dark:text-amber-400" />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200 mb-1">
                You are being relieved early
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">
                Your last working day was moved from {fmt(r.originalLastWorkingDay)} to {fmt(r.lastWorkingDay)}.
                Reason: {r.earlyReliefReason}
              </p>
            </div>
          )}

          {r.decisionNote && (
            <div className="relative rounded-xl bg-brand-500/5 border border-brand-500/20 p-4 pl-11">
              <MessageSquare className="w-4 h-4 absolute left-4 top-4 text-brand-500" />
              <div className="text-[11px] font-semibold uppercase tracking-wider theme-muted mb-1">
                Note from {r.decidedBy?.name || 'HR'}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">{r.decisionNote}</p>
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs theme-muted">
            {pending
              ? 'Changed your mind? You can withdraw until it is accepted.'
              : 'Want to take it back? Please speak to HR.'}
          </p>
          {pending && (
            <button type="button" onClick={() => handleWithdraw(r)} disabled={busyId === r._id} className="btn-secondary shrink-0">
              <Undo2 className="w-4 h-4" /> {busyId === r._id ? 'Withdrawing…' : 'Withdraw resignation'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="theme-card overflow-hidden text-xs">
      <div className="p-5 sm:p-6 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
        <div className="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <DoorOpen className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Submit resignation</h3>
          <p className="theme-muted">Your manager and HR will be emailed as soon as you submit.</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
        <div className="max-w-xs">
          <label className="theme-label" htmlFor="resignationDate">Resignation date</label>
          <input
            id="resignationDate"
            type="date"
            value={form.resignationDate}
            onChange={setField('resignationDate')}
            className="theme-input w-full"
            required
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="theme-label" htmlFor="reason">Reason</label>
            <span className="text-[10px] theme-muted">{form.reason.length}/1000</span>
          </div>
          <textarea
            id="reason"
            value={form.reason}
            onChange={setField('reason')}
            rows={5}
            maxLength={1000}
            minLength={3}
            required
            placeholder="e.g. Pursuing higher studies from next semester."
            className="theme-input w-full resize-none"
          />
        </div>

        {confirming && (
          <div className="flex gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-800 dark:text-rose-200">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Are you sure? HR and your manager will be emailed right away. You can withdraw it until it is accepted.</p>
          </div>
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
        {confirming && (
          <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">Cancel</button>
        )}
        <button type="submit" disabled={saving} className="btn-primary">
          <Send className="w-4 h-4" />
          {saving ? 'Submitting…' : confirming ? 'Yes, submit resignation' : 'Submit resignation'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Resignation</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Submit your resignation and track it until your last working day.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {loading ? (
            <div className="theme-card p-6 space-y-3 animate-pulse">
              <div className="h-5 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-24 rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ) : open ? (
            renderOpen(open)
          ) : (
            renderForm()
          )}

          {history.length > 0 && (
            <div className="theme-card p-5 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <History className="w-4 h-4 theme-muted" /> Past requests
              </h3>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {history.map((r) => (
                  <li key={r._id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        Resignation dated {fmt(r.resignationDate)}
                        {r.lastWorkingDay && <span className="font-normal theme-muted"> · last working day {fmt(r.lastWorkingDay)}</span>}
                      </div>
                      <div className="theme-muted break-words">{r.reason}</div>
                      {r.decisionNote && (
                        <div className="theme-muted break-words">Note from {r.decidedBy?.name || 'HR'}: {r.decisionNote}</div>
                      )}
                    </div>
                    <StatusPill r={r} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="theme-card p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">How it works</h3>
          <ol className="space-y-4">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">{s.title}</div>
                  <div className="text-[11px] theme-muted leading-relaxed">{s.text}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-[11px] theme-muted">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>Everything here is visible only to you, your reporting manager and HR.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MyResignationPage;
