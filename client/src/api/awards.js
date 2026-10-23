import api from './client';
import { readBlobError } from './files';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Employee of the Month winners for a month; no month means the latest one. */
export const fetchAwards = (month, year) =>
  api.get('/awards', { params: month && year ? { month, year } : {} });

export const createAward = ({ employeeId, month, year, citation }) =>
  api.post('/awards', { employeeId, month, year, citation });

export const resendCertificate = (awardId) => api.post(`/awards/${awardId}/send-certificate`);

export const deleteAward = (awardId) => api.delete(`/awards/${awardId}`);

/** The endpoint needs an Authorization header, so fetch the PDF as a blob. */
export const downloadCertificate = async (award) => {
  const res = await api.get(`/awards/${award._id}/certificate`, { responseType: 'blob' });

  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `Employee_of_the_Month_${String(award.employee?.name || 'certificate').replace(
    /\s+/g,
    '_'
  )}_${award.year}-${String(award.month).padStart(2, '0')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export { readBlobError, MONTHS };

// --- Certificate signatures / stamp (admin) ---

export const fetchCertificateImages = () => api.get('/awards/certificate-images');

/** The image itself needs the auth header, so it comes back as an object URL. */
export const fetchCertificateImageUrl = async (key) => {
  const res = await api.get(`/awards/certificate-images/${key}`, { responseType: 'blob' });
  return window.URL.createObjectURL(res.data);
};

export const uploadCertificateImage = (key, file) => {
  const form = new FormData();
  form.append('image', file);
  return api.put(`/awards/certificate-images/${key}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteCertificateImage = (key) => api.delete(`/awards/certificate-images/${key}`);

/** Opens a sample certificate with the current signatures in a new tab. */
export const openCertificatePreview = async () => {
  // Open the tab inside the click, before the request, or popup blockers stop it.
  const tab = window.open('', '_blank');
  try {
    const res = await api.get('/awards/certificate-preview', { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (tab) tab.location.href = blobUrl;
    else window.location.assign(blobUrl);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    tab?.close();
    throw error;
  }
};
