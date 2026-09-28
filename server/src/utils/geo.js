/**
 * Great-circle distance between two lat/lng points, in meters (Haversine formula).
 * Used to flag punches made far from the office without needing any paid maps API.
 */
const EARTH_RADIUS_METERS = 6371000;

const toRadians = (deg) => (deg * Math.PI) / 180;

const distanceInMeters = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
};

const isValidCoordinate = (lat, lng) =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  !Number.isNaN(lat) &&
  !Number.isNaN(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

// The office sites to check a punch against. Prefers the multi-location list;
// falls back to the legacy single officeLocation for orgs that set it before
// multi-location support existed and haven't re-saved it since.
const getConfiguredOffices = (settings) => {
  const list = Array.isArray(settings?.officeLocations) ? settings.officeLocations : [];
  const valid = list.filter(
    (loc) => loc?.lat != null && loc?.lng != null && isValidCoordinate(Number(loc.lat), Number(loc.lng))
  );
  if (valid.length > 0) return valid;

  const legacy = settings?.officeLocation;
  if (legacy && legacy.lat != null && legacy.lng != null && isValidCoordinate(Number(legacy.lat), Number(legacy.lng))) {
    return [
      {
        name: legacy.address || 'Office',
        lat: legacy.lat,
        lng: legacy.lng,
        radiusMeters: Number(settings.geofenceRadiusMeters) || 200,
      },
    ];
  }
  return [];
};

/**
 * Builds the location snapshot stored on an attendance punch. Returns null
 * when the client sent no coordinates (permission denied, unsupported browser).
 * distanceMeters / isOutsideGeofence are only set when the org has at least one
 * office location configured — otherwise there is nothing to compare against.
 *
 * With multiple offices, a punch is "inside" the geofence the moment it falls
 * within *any one* of their radii — distanceMeters/matchedLocationName report
 * whichever office is nearest, purely for display.
 */
const buildPunchLocation = (rawLocation, settings) => {
  if (!rawLocation) return null;
  const lat = Number(rawLocation.lat);
  const lng = Number(rawLocation.lng);
  if (!isValidCoordinate(lat, lng)) return null;

  const location = {
    lat,
    lng,
    accuracy: Number.isFinite(Number(rawLocation.accuracy)) ? Number(rawLocation.accuracy) : null,
    distanceMeters: null,
    isOutsideGeofence: false,
    matchedLocationName: '',
  };

  const offices = getConfiguredOffices(settings);
  if (offices.length === 0) return location;

  let nearestDistance = Infinity;
  let nearestName = '';
  let withinAnyRadius = false;

  for (const office of offices) {
    const distance = distanceInMeters(lat, lng, Number(office.lat), Number(office.lng));
    const radius = Number(office.radiusMeters) || 50;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestName = office.name || office.address || 'Office';
    }
    if (distance <= radius) withinAnyRadius = true;
  }

  location.distanceMeters = nearestDistance;
  location.matchedLocationName = nearestName;
  location.isOutsideGeofence = !withinAnyRadius;

  return location;
};

// 81592 -> "81.6 km", 150 -> "150m"
const formatDistanceMeters = (meters) => {
  if (!Number.isFinite(meters)) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
};

/**
 * Reverse geocoding (coordinates -> area / city / address) via OpenStreetMap's
 * free Nominatim service. Its usage policy allows at most 1 request/second and
 * asks for an identifying User-Agent, so lookups run one at a time and results
 * are cached per ~11m grid cell. Resolves to null on any failure or when
 * disabled with REVERSE_GEOCODING=false — callers must cope without an address.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const GEOCODE_TIMEOUT_MS = 5000;
const GEOCODE_GAP_MS = 1100;
const GEOCODE_CACHE_LIMIT = 500;
const geocodeCache = new Map();
let geocodeQueue = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchPlace = async (lat, lng) => {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
    const contact = process.env.GEOCODE_CONTACT_EMAIL ? ` (${process.env.GEOCODE_CONTACT_EMAIL})` : '';
    const res = await fetch(url, {
      headers: { 'User-Agent': `DayflowHRMS/1.0${contact}`, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const a = data.address || {};
    return {
      area:
        a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || a.hamlet || a.road || '',
      city: a.city || a.town || a.village || a.municipality || a.county || a.state_district || '',
      address: data.display_name || '',
    };
  } catch (err) {
    console.warn('📍 Reverse geocoding failed:', err.message);
    return null;
  }
};

const reverseGeocode = (lat, lng) => {
  if (process.env.REVERSE_GEOCODING === 'false') return Promise.resolve(null);
  lat = Number(lat);
  lng = Number(lng);
  if (!isValidCoordinate(lat, lng)) return Promise.resolve(null);

  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return Promise.resolve(geocodeCache.get(key));

  const result = geocodeQueue.then(() => fetchPlace(lat, lng));
  geocodeQueue = result.then(() => wait(GEOCODE_GAP_MS));

  return result.then((place) => {
    if (place) {
      if (geocodeCache.size >= GEOCODE_CACHE_LIMIT) geocodeCache.delete(geocodeCache.keys().next().value);
      geocodeCache.set(key, place);
    }
    return place;
  });
};

// { area: 'Sector 14', city: 'Gurugram' } -> "Sector 14, Gurugram"
const formatPlace = (place) => [place?.area, place?.city].filter(Boolean).join(', ');

// Email-friendly "where exactly" lines for a stored punch location, so HR can
// open the spot on a map straight from the alert. Empty when there's no fix.
const describePunchLocation = (location) => {
  if (!location || location.lat == null || location.lng == null) return '';
  const lines = [];
  const place = formatPlace(location);
  if (place) lines.push(`Area: ${place}`);
  if (location.address) lines.push(`Address: ${location.address}`);
  lines.push(`Map: https://www.google.com/maps?q=${location.lat},${location.lng}`);
  if (Number.isFinite(location.accuracy)) {
    lines.push(`GPS accuracy: ±${Math.round(location.accuracy)}m`);
  }
  return lines.join('\n');
};

module.exports = {
  distanceInMeters,
  isValidCoordinate,
  buildPunchLocation,
  formatDistanceMeters,
  reverseGeocode,
  formatPlace,
  describePunchLocation,
};
