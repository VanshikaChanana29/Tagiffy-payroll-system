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
  const valid = list.filter((loc) => isValidCoordinate(Number(loc.lat), Number(loc.lng)));
  if (valid.length > 0) return valid;

  const legacy = settings?.officeLocation;
  if (legacy && isValidCoordinate(Number(legacy.lat), Number(legacy.lng))) {
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

module.exports = { distanceInMeters, isValidCoordinate, buildPunchLocation, formatDistanceMeters };
