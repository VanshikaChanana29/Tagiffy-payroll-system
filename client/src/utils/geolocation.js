/**
 * Promise wrapper around the browser Geolocation API. Resolves to null instead
 * of rejecting when location is unavailable/denied, so callers can treat a
 * punch with no location as a soft failure rather than blocking attendance.
 */
export const getCurrentLocation = ({ timeout = 8000 } = {}) => {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
};
