import React, { useState, useEffect } from 'react';
import { MapPin, Save, Crosshair, AlertTriangle, Plus, Trash2, Building2 } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { getCurrentLocation } from '../../utils/geolocation';

const DEFAULT_RADIUS = 50;

const emptyLocation = (index = 0) => ({
  name: `Office ${index + 1}`,
  lat: '',
  lng: '',
  address: '',
  radiusMeters: DEFAULT_RADIUS,
});

/**
 * One or more office sites for geofenced punches. A punch is treated as valid
 * the moment it falls within any single site's radius, so staff working out
 * of either branch never get flagged as "away".
 */
const OfficeLocationPanel = () => {
  const toast = useToast();
  const [locations, setLocations] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locatingIndex, setLocatingIndex] = useState(null);

  useEffect(() => {
    api
      .get('/org-settings')
      .then((res) => {
        if (!res.data.success) return;
        const settings = res.data.settings;
        if (Array.isArray(settings.officeLocations) && settings.officeLocations.length > 0) {
          setLocations(
            settings.officeLocations.map((loc, i) => ({
              name: loc.name || `Office ${i + 1}`,
              lat: loc.lat ?? '',
              lng: loc.lng ?? '',
              address: loc.address || '',
              radiusMeters: loc.radiusMeters ?? DEFAULT_RADIUS,
            }))
          );
        } else if (settings.officeLocation?.lat != null && settings.officeLocation?.lng != null) {
          // Carry the pre-multi-location setup forward as the first entry.
          setLocations([
            {
              name: settings.officeLocation.address || 'Office 1',
              lat: settings.officeLocation.lat,
              lng: settings.officeLocation.lng,
              address: settings.officeLocation.address || '',
              radiusMeters: settings.geofenceRadiusMeters ?? DEFAULT_RADIUS,
            },
          ]);
        } else {
          setLocations([]);
        }
      })
      .catch(() => toast.error('Failed to load office locations'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLocation = (index, patch) => {
    setLocations((prev) => prev.map((loc, i) => (i === index ? { ...loc, ...patch } : loc)));
  };

  const addLocation = () => {
    setLocations((prev) => [...prev, emptyLocation(prev.length)]);
  };

  const removeLocation = (index) => {
    setLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUseCurrentLocation = async (index) => {
    setLocatingIndex(index);
    const location = await getCurrentLocation();
    setLocatingIndex(null);
    if (!location) {
      toast.error('Could not read this device\'s location. Check browser permission and try again.');
      return;
    }
    updateLocation(index, { lat: location.lat, lng: location.lng });
    toast.success('Coordinates captured. Save to apply.');
  };

  const handleSave = async (e) => {
    e.preventDefault();

    for (const loc of locations) {
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        toast.error(`Enter a valid latitude and longitude for "${loc.name || 'this location'}".`);
        return;
      }
      const radius = Number(loc.radiusMeters);
      if (Number.isNaN(radius) || radius < 20) {
        toast.error(`Geofence radius for "${loc.name || 'this location'}" must be at least 20 meters.`);
        return;
      }
    }

    try {
      setSaving(true);
      const res = await api.put('/org-settings', {
        officeLocations: locations.map((loc) => ({
          name: loc.name?.trim() || undefined,
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          address: loc.address || '',
          radiusMeters: Number(loc.radiusMeters),
        })),
      });
      if (res.data.success) {
        toast.success('Office locations saved. New punches will be checked against them.');
        setLocations(
          (res.data.settings.officeLocations || []).map((loc, i) => ({
            name: loc.name || `Office ${i + 1}`,
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address || '',
            radiusMeters: loc.radiusMeters ?? DEFAULT_RADIUS,
          }))
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save office locations');
    } finally {
      setSaving(false);
    }
  };

  if (!locations) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
        Loading office locations...
      </div>
    );
  }

  const field =
    'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500';
  const label = 'block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';

  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <MapPin className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Office Locations & Geofence</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Add every office site. A punch is valid within any one site's radius — flagged as
            "away" only when it's outside all of them.
          </p>
        </div>
      </div>

      {locations.length === 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            No office locations set yet. Punches will record location but won't be flagged
            until you add at least one site here.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-4">
          {locations.map((loc, index) => (
            <div
              key={index}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Building2 className="w-4 h-4 text-brand-500 shrink-0" />
                  <input
                    type="text"
                    placeholder={`Office ${index + 1}`}
                    value={loc.name}
                    onChange={(e) => updateLocation(index, { name: e.target.value })}
                    className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none border-b border-transparent focus:border-brand-500 pb-0.5"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLocation(index)}
                  title="Remove this location"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleUseCurrentLocation(index)}
                disabled={locatingIndex === index}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <Crosshair className={`w-3.5 h-3.5 ${locatingIndex === index ? 'animate-pulse' : ''}`} />
                {locatingIndex === index ? 'Reading location...' : 'Set from my current location'}
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={label}>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 28.6139"
                    value={loc.lat}
                    onChange={(e) => updateLocation(index, { lat: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 77.2090"
                    value={loc.lng}
                    onChange={(e) => updateLocation(index, { lng: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Geofence Radius (m)</label>
                  <input
                    type="number"
                    min="20"
                    step="10"
                    value={loc.radiusMeters}
                    onChange={(e) => updateLocation(index, { radiusMeters: e.target.value })}
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Address (optional label)</label>
                <input
                  type="text"
                  placeholder="e.g. WorkZen HQ, Sector 62, Noida"
                  value={loc.address}
                  onChange={(e) => updateLocation(index, { address: e.target.value })}
                  className={field}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLocation}
          className="w-full py-3 rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-800 hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Another Office Location
        </button>

        <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Office Locations'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OfficeLocationPanel;
