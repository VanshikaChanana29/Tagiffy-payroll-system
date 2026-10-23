import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Calendar, Send, Download, Trash2, Mail, MailWarning } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  fetchAwards,
  createAward,
  resendCertificate,
  deleteAward,
  downloadCertificate,
  readBlobError,
  MONTHS,
} from '../../api/awards';
import { buildInitialsAvatar } from '../../utils/initialsAvatar';
import CertificateSignaturesPanel from '../../components/awards/CertificateSignaturesPanel';

// Mirrors the server cap: usually one winner per department, sometimes two.
const MAX_WINNERS_PER_DEPARTMENT = 2;

const emptyForm = { department: '', employeeId: '', citation: '' };

const EmployeeOfMonthPage = () => {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const isFutureMonth = year === now.getFullYear() && month > now.getMonth() + 1;
  const period = `${MONTHS[month - 1]} ${year}`;

  const loadAwards = async () => {
    setLoading(true);
    try {
      const res = await fetchAwards(month, year);
      setAwards(res.data.awards || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load winners');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAwards();
  }, [month, year]);

  useEffect(() => {
    api
      .get('/users', { params: { status: 'Active' } })
      .then((res) => setEmployees(res.data.employees || []))
      .catch(() => toast.error('Failed to load employees'));
  }, []);

  // Departments as recorded on people, so the picker never offers an empty one.
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(),
    [employees]
  );

  const awardsByDepartment = useMemo(() => {
    const groups = {};
    awards.forEach((a) => {
      (groups[a.department] ||= []).push(a);
    });
    return groups;
  }, [awards]);

  const wonIds = new Set(awards.map((a) => a.employee?._id));
  const departmentFull =
    form.department && (awardsByDepartment[form.department]?.length || 0) >= MAX_WINNERS_PER_DEPARTMENT;
  const candidates = employees
    .filter((e) => e.department === form.department && !wonIds.has(e._id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employeeId) return;
    setSubmitting(true);
    try {
      const res = await createAward({ ...form, month, year });
      if (res.data.emailed) toast.success(res.data.message);
      else toast.error(res.data.message, 7000);
      setForm({ ...emptyForm, department: form.department });
      loadAwards();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to name the winner');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (award) => {
    setBusyId(award._id);
    try {
      const res = await resendCertificate(award._id);
      toast.success(res.data.message);
      loadAwards();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send the certificate');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (award) => {
    if (!window.confirm(`Remove ${award.employee.name} as Employee of the Month for ${period}?`)) return;
    setBusyId(award._id);
    try {
      const res = await deleteAward(award._id);
      toast.success(res.data.message);
      loadAwards();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove the award');
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (award) => {
    setBusyId(award._id);
    try {
      await downloadCertificate(award);
    } catch (error) {
      toast.error((await readBlobError(error)) || 'Failed to download certificate');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Employee of the Month
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Name up to {MAX_WINNERS_PER_DEPARTMENT} winners per department. Each winner is emailed their
            certificate and shown on everyone's dashboard.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="theme-input text-xs">
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="theme-input text-xs">
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Name a winner */}
        <form onSubmit={handleSubmit} className="theme-card p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <h3 className="theme-section-title">Name a winner for {period}</h3>
          </div>

          {isFutureMonth ? (
            <p className="text-xs theme-muted">{period} hasn't started yet. Pick this month or an earlier one.</p>
          ) : (
            <>
              <div>
                <label className="theme-label">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...emptyForm, department: e.target.value })}
                  className="theme-input w-full"
                  required
                >
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {awardsByDepartment[d]?.length ? ` (${awardsByDepartment[d].length} named)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {departmentFull ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {form.department} already has {MAX_WINNERS_PER_DEPARTMENT} winners for {period}. Remove one to
                  name someone else.
                </p>
              ) : (
                <>
                  <div>
                    <label className="theme-label">Employee</label>
                    <select
                      value={form.employeeId}
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                      className="theme-input w-full"
                      disabled={!form.department}
                      required
                    >
                      <option value="">{form.department ? 'Select employee' : 'Pick a department first'}</option>
                      {candidates.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {emp.name} · {emp.designation}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="theme-label">Why they won (optional)</label>
                    <textarea
                      value={form.citation}
                      onChange={(e) => setForm({ ...form, citation: e.target.value })}
                      rows={3}
                      maxLength={300}
                      placeholder="e.g. Closed the biggest campaign of the quarter ahead of schedule."
                      className="theme-input w-full resize-none"
                    />
                    <p className="text-[11px] theme-muted mt-1">Shown on the dashboard and in the email.</p>
                  </div>

                  <button type="submit" disabled={submitting || !form.employeeId} className="btn-primary w-full">
                    <Send className="w-4 h-4" />
                    {submitting ? 'Sending…' : 'Announce & email certificate'}
                  </button>
                </>
              )}
            </>
          )}
        </form>

        {/* Winners */}
        <div className="lg:col-span-2 theme-card p-5 space-y-4">
          <h3 className="theme-section-title">Winners · {period}</h3>

          {loading ? (
            <div className="py-8 text-center text-xs theme-muted">Loading…</div>
          ) : awards.length === 0 ? (
            <div className="py-8 text-center text-xs theme-muted rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              No winners named for {period} yet.
            </div>
          ) : (
            Object.entries(awardsByDepartment).map(([department, list]) => (
              <div key={department} className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider theme-muted">{department}</div>
                {list.map((award) => {
                  const emp = award.employee;
                  const busy = busyId === award._id;
                  return (
                    <div
                      key={award._id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <img
                          src={emp.avatar || buildInitialsAvatar(emp.name)}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{emp.name}</div>
                          <div className="text-[11px] theme-muted truncate">
                            {emp.designation} · {emp.email}
                          </div>
                          {award.citation && (
                            <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-300">“{award.citation}”</p>
                          )}
                          <div className="mt-1.5">
                            {award.certificateEmailedAt ? (
                              <span className="badge-success">
                                <Mail className="w-3 h-3" />
                                Emailed {format(new Date(award.certificateEmailedAt), 'dd MMM, hh:mm a')}
                              </span>
                            ) : (
                              <span className="badge-danger">
                                <MailWarning className="w-3 h-3" /> Certificate not emailed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownload(award)}
                          disabled={busy}
                          className="btn-secondary !py-1.5 !text-xs"
                          title="Download certificate"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResend(award)}
                          disabled={busy}
                          className="btn-secondary !py-1.5 !text-xs"
                          title="Email the certificate again"
                        >
                          <Send className="w-3.5 h-3.5" /> {award.certificateEmailedAt ? 'Resend' : 'Send'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(award)}
                          disabled={busy}
                          className="btn-icon text-rose-600 dark:text-rose-400"
                          aria-label={`Remove ${emp.name}`}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <CertificateSignaturesPanel />
    </div>
  );
};

export default EmployeeOfMonthPage;
