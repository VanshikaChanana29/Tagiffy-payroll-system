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

/**
 * Builds the location snapshot stored on an attendance punch. Returns null
 * when the client sent no coordinates (permission denied, unsupported browser).
 * distanceMeters / isOutsideGeofence are only set when the org has an office
 * location configured — otherwise there is nothing to compare against.
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
  };

  const office = settings?.officeLocation;
  if (office && isValidCoordinate(office.lat, office.lng)) {
    const distance = distanceInMeters(lat, lng, office.lat, office.lng);
    const radius = Number(settings.geofenceRadiusMeters) || 200;
    location.distanceMeters = distance;
    location.isOutsideGeofence = distance > radius;
  }

  return location;
};

// 81592 -> "81.6 km", 150 -> "150m"
const formatDistanceMeters = (meters) => {
  if (!Number.isFinite(meters)) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
};

module.exports = { distanceInMeters, isValidCoordinate, buildPunchLocation, formatDistanceMeters };
