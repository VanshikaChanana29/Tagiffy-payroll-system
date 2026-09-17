import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Clock, CalendarDays, Building } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { resolveAvatar } from '../../utils/initialsAvatar';

/**
 * A manager's view of the people who report to them.
 *
 * Deliberately read-only: hiring, salary and role changes stay with HR. This is
 * for knowing who is on your team and what needs your attention.
 */
const TeamDirectoryPage = () => {
  const toast = useToast();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const [presentToday, setPresentToday] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [teamRes, leaveRes, corrRes, attRes] = await Promise.all([
          api.get('/users/my-team'),
          api.get('/leaves/all', { params: { status: 'Pending' } }),
          api.get('/attendance/requests', { params: { status: 'Pending' } }),
          api.get('/attendance/all'),
        ]);

        if (teamRes.data.success) setTeam(teamRes.data.team || []);
        if (leaveRes.data.success) setPendingLeaves(leaveRes.data.leaves?.length || 0);
        if (corrRes.data.success) setPendingCorrections(corrRes.data.requests?.length || 0);
        if (attRes.data.success) setPresentToday(attRes.data.stats?.totalPresent || 0);
      } catch (err) {
        toast.error('Failed to load your team');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = [
    { label: 'Team size', value: team.length, icon: Users, tone: 'text-slate-900 dark:text-white' },
    { label: 'Present today', value: presentToday, icon: Clock, tone: 'text-emerald-600 dark:text-emerald-400' },
    {
      label: 'Leave to approve',
      value: pendingLeaves,
      icon: CalendarDays,
      tone: pendingLeaves > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white',
      to: '/team/leaves',
    },
    {
      label: 'Corrections to review',
      value: pendingCorrections,
      icon: Clock,
      tone: pendingCorrections > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white',
      to: '/team/attendance',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          My Team
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          The people reporting to you. HR handles hiring, pay and role changes.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const card = (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors hover:border-brand-400/60">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`text-2xl font-black mt-1 ${stat.tone}`}>{stat.value}</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
          return stat.to ? (
            <Link key={stat.label} to={stat.to}>
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          Loading your team...
        </div>
      ) : team.length === 0 ? (
        <div className="p-10 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Nobody reports to you yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ask HR to set you as the reporting manager for your team members.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {team.map((member) => (
            <div
              key={member._id}
              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-center gap-3">
                <img
                  src={resolveAvatar(member)}
                  alt={member.name}
                  className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {member.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {member.designation}
                  </div>
                </div>
                <span
                  className={`ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    member.status === 'Active'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                      : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25'
                  }`}
                >
                  {member.status}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2 truncate">
                  <Building className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  {member.department}
                </div>
                <div className="flex items-center gap-2 truncate">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  {member.email}
                </div>
                {member.phone && (
                  <div className="flex items-center gap-2 truncate">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    {member.phone}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Leave balance:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {member.leaveBalance?.paid ?? 0} paid
                </span>
                <span className="text-slate-400">·</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {member.leaveBalance?.sick ?? 0} sick
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamDirectoryPage;
