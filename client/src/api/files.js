import api from './client';

/** Uploads a real PDF for an employee. The browser sets the multipart boundary. */
export const uploadDocument = (userId, { file, name, type }) => {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  form.append('type', type);
  return api.post(`/users/${userId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Downloads a document. The route needs an Authorization header, so we fetch it
 * as a blob and hand the browser a temporary object URL to save.
 */
export const downloadDocument = async (userId, doc) => {
  const res = await api.get(`/users/${userId}/documents/${doc._id}/download`, {
    responseType: 'blob',
  });

  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = doc.originalName || doc.name || 'document.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

/** The server returns JSON errors even on a blob request, so decode them for the toast. */
export const readBlobError = async (error) => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).message;
    } catch {
      return null;
    }
  }
  return data?.message || null;
};

export const uploadAvatar = (userId, file) => {
  const form = new FormData();
  form.append('photo', file);
  return api.post(`/users/${userId}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const resetAvatar = (userId) => api.delete(`/users/${userId}/avatar`);

export const MAX_DOC_MB = 10;
export const MAX_PHOTO_MB = 3;

/** Downloads the fillable .xlsx template for bulk employee onboarding. */
export const downloadEmployeeTemplate = async () => {
  const res = await api.get('/users/bulk-upload/template', { responseType: 'blob' });

  const blobUrl = window.URL.createObjectURL(
    new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  );
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = 'employee_upload_template.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

/** Uploads a filled-in employee sheet (.xlsx/.xls/.csv) for bulk onboarding. */
export const uploadEmployeeSheet = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/users/bulk-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
