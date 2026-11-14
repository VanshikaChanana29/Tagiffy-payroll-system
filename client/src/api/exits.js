import api from './client';

export const EXIT_TYPES = ['Resigned', 'Terminated', 'Absconded', 'Other'];

/** The exit register; filters: { status, type, year }. */
export const fetchExits = (params = {}) => api.get('/exits', { params });

export const createExit = (data) => api.post('/exits', data);

export const updateExit = (id, data) => api.put(`/exits/${id}`, data);

export const withdrawExit = (id) => api.post(`/exits/${id}/withdraw`);

/** Date → 'YYYY-MM-DD' in local time, for <input type="date">. */
export const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** What the "notice date" means for each exit type. */
export const noticeDateLabel = (exitType) =>
  ({
    Resigned: 'Resignation date',
    Terminated: 'Termination date',
    Absconded: 'Last seen / reported on',
  })[exitType] || 'Exit decided on';

/** Move the last working day up (replacement found, role no longer needed...). */
export const relieveEarly = (id, data) => api.post(`/exits/${id}/relieve-early`, data);
