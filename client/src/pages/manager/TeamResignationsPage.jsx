import React from 'react';
import ResignationRequestsPanel from '../../components/admin/ResignationRequestsPanel';

/** A manager reviews resignations from their direct reports. */
const TeamResignationsPage = () => (
  <div className="space-y-6">
    <div>
      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Team Resignations</h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
        Resignations from people who report to you. Accept one to set their last working day, or reject it.
      </p>
    </div>
    <ResignationRequestsPanel />
  </div>
);

export default TeamResignationsPage;
