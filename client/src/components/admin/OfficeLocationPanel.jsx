import React, { useState, useEffect } from 'react';
import { MapPin, Save, Crosshair, AlertTriangle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { getCurrentLocation } from '../../utils/geolocation';

/**
 * Office coordinates and the geofence radius used to flag punches made far
 * from the office. No maps API involved — just lat/lng and a distance check.
 */
const OfficeLocationPanel = () => {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    api
      .get('/org-settings')
      .then((res) => {
        if (res.data.success) setSettings(res.data.settings);
      })
      .catch(() => toast.error('Failed to load office location'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    const location = await getCurrentLocation();
    setLocating(false);
    if (!location) {
      toast.error('Could not read this device\'s location. Check browser permission and try again.');
      return;
    }
    setSettings((prev) => ({
      ...prev,
      officeLocation: { ...prev.officeLocation, lat: location.lat, lng: location.lng },
    }));
    toast.success('Coordinates captured. Save to apply.');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const lat = Number(settings.officeLocation?.lat);
    const lng = Number(settings.officeLocation?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error('Enter a valid latitude and longitude, or use "Set from my current location".');
      return;
    }

    try {
      setSaving(true);
      const res = await api.put('/org-settings', {
        officeLocation: {
          lat,
          lng,
          address: settings.officeLocation?.address || '',
        },
        geofenceRadiusMeters: Number(settings.geofenceRadiusMeters),
      });
      if (res.data.success) {
        toast.success('Office location saved. New punches will be checked against it.');
        setSettings(res.data.settings);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save office location');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
        Loading office location...
      </div>
    );
  }

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';
  const isConfigured = settings.officeLocation?.lat != null && settings.officeLocation?.lng != null;

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <MapPin className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Office Location & Geofence</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Punches made beyond the radius below are flagged as "away from office"
          </p>
        </div>
      </div>

      {!isConfigured && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            No office location set yet. Punches will record location but won't be flagged
            until you set coordinates here.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <Crosshair className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} />
          {locating ? 'Reading location...' : 'Set from my current location'}
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Latitude</label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 28.6139"
              value={settings.officeLocation?.lat ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  officeLocation: { ...settings.officeLocation, lat: e.target.value },
                })
              }
              className={field}
            />
          </div>
          <div>
            <label className={label}>Longitude</label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 77.2090"
              value={settings.officeLocation?.lng ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  officeLocation: { ...settings.officeLocation, lng: e.target.value },
                })
              }
              className={field}
            />
          </div>
          <div>
            <label className={label}>Geofence Radius (m)</label>
            <input
              type="number"
              min="20"
              step="10"
              value={settings.geofenceRadiusMeters}
              onChange={(e) => setSettings({ ...settings, geofenceRadiusMeters: e.target.value })}
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>Office Address (optional label)</label>
          <input
            type="text"
            placeholder="e.g. WorkZen HQ, Sector 62, Noida"
            value={settings.officeLocation?.address || ''}
            onChange={(e) =>
              setSettings({
                ...settings,
                officeLocation: { ...settings.officeLocation, address: e.target.value },
              })
            }
            className={field}
          />
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Office Location'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OfficeLocationPanel;
