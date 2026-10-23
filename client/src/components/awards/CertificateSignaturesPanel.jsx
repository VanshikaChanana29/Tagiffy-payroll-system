import React, { useState, useEffect, useRef } from 'react';
import { PenLine, Upload, Trash2, Eye } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  fetchCertificateImages,
  fetchCertificateImageUrl,
  uploadCertificateImage,
  deleteCertificateImage,
  openCertificatePreview,
  readBlobError,
} from '../../api/awards';

const MAX_MB = 2;

/**
 * The directors' signatures (and optional company stamp) printed on every
 * Employee of the Month certificate. Stored in file storage, not the codebase,
 * so real signatures never end up in the repository.
 */
const CertificateSignaturesPanel = () => {
  const toast = useToast();
  const [slots, setSlots] = useState([]);
  const [previews, setPreviews] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const inputs = useRef({});

  const load = async () => {
    try {
      const res = await fetchCertificateImages();
      const list = res.data.slots || [];
      setSlots(list);

      const urls = {};
      await Promise.all(
        list
          .filter((s) => s.source)
          .map(async (s) => {
            try {
              urls[s.key] = await fetchCertificateImageUrl(s.key);
            } catch {
              // A missing thumbnail just shows the empty state.
            }
          })
      );
      setPreviews((old) => {
        Object.values(old).forEach((u) => window.URL.revokeObjectURL(u));
        return urls;
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load certificate signatures');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePick = async (slot, file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Please choose a PNG or JPG image.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Image is larger than ${MAX_MB} MB.`);
      return;
    }
    setBusyKey(slot.key);
    try {
      const res = await uploadCertificateImage(slot.key, file);
      toast.success(res.data.message);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload image');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (slot) => {
    if (!window.confirm(`Remove ${slot.label}? Certificates will show a blank line instead.`)) return;
    setBusyKey(slot.key);
    try {
      const res = await deleteCertificateImage(slot.key);
      toast.success(res.data.message);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove image');
    } finally {
      setBusyKey(null);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      await openCertificatePreview();
    } catch (error) {
      toast.error((await readBlobError(error)) || 'Failed to build the preview');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="theme-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <PenLine className="w-4 h-4" />
          </div>
          <div>
            <h3 className="theme-section-title">Certificate signatures</h3>
            <p className="text-[11px] theme-muted">
              Printed on every certificate. A PNG with a transparent background looks best; a clean scan on
              white paper also works.
            </p>
          </div>
        </div>
        <button type="button" onClick={handlePreview} disabled={previewing} className="btn-secondary shrink-0">
          <Eye className="w-4 h-4" />
          {previewing ? 'Preparing…' : 'Preview certificate'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {slots.map((slot) => {
          const busy = busyKey === slot.key;
          return (
            <div
              key={slot.key}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex flex-col gap-2"
            >
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{slot.label}</div>

              {/* White, like the certificate paper, so the preview is honest in dark mode too. */}
              <div className="h-20 rounded-lg bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                {previews[slot.key] ? (
                  <img src={previews[slot.key]} alt="" className="max-h-16 max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-slate-400">Not uploaded</span>
                )}
              </div>

              {slot.source === 'local' && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  Using a file on this computer only. Upload it here so the live site has it.
                </p>
              )}

              <div className="flex items-center gap-2 mt-auto">
                <input
                  ref={(el) => (inputs.current[slot.key] = el)}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    handlePick(slot, e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputs.current[slot.key]?.click()}
                  disabled={busy}
                  className="btn-secondary flex-1 !py-1.5 !text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {busy ? 'Saving…' : slot.source === 'uploaded' ? 'Replace' : 'Upload'}
                </button>
                {slot.source === 'uploaded' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(slot)}
                    disabled={busy}
                    className="btn-icon text-rose-600 dark:text-rose-400"
                    aria-label={`Remove ${slot.label}`}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CertificateSignaturesPanel;
