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

export const MAX_RECEIPT_MB = 5;

/** Submits a reimbursement request, with an optional receipt (PDF or image). */
export const submitReimbursement = ({ category, amount, expenseDate, description, receipt }) => {
  const form = new FormData();
  form.append('category', category);
  form.append('amount', amount);
  form.append('expenseDate', expenseDate);
  form.append('description', description);
  if (receipt) form.append('receipt', receipt);
  return api.post('/reimbursements', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/** Downloads a reimbursement's receipt as a blob and saves it via the browser. */
export const downloadReimbursementReceipt = async (reimbursement) => {
  const res = await api.get(`/reimbursements/${reimbursement._id}/receipt`, {
    responseType: 'blob',
  });

  const contentType = res.headers['content-type'] || 'application/octet-stream';
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = reimbursement.receipt?.originalName || 'receipt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};
