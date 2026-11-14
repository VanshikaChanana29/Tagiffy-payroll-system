import api from './client';

export const submitResignation = (data) => api.post('/resignations', data);

export const fetchMyResignations = () => api.get('/resignations/mine');

export const withdrawResignation = (id) => api.post(`/resignations/${id}/withdraw`);

/** HR: everyone; manager: their direct reports. Filter: { status }. */
export const fetchResignations = (params = {}) => api.get('/resignations', { params });

export const acceptResignation = (id, data) => api.post(`/resignations/${id}/accept`, data);

export const rejectResignation = (id, data) => api.post(`/resignations/${id}/reject`, data);

/** What the employee should read as the current state. */
export const resignationLabel = (r) => (r.status === 'Accepted' && r.exitStatus ? r.exitStatus : r.status);

export const RESIGNATION_STYLES = {
  Pending: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25',
  Rejected: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25',
  Withdrawn: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25',
  Accepted: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  'Serving Notice': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
  Exited: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
};
