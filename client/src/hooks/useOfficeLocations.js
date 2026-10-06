import { useState, useEffect } from 'react';
import api from '../api/client';

/**
 * Loads the office sites from Org Settings as [{ _id, name }], for the
 * employee "Office Location" dropdowns and filters.
 */
export const useOfficeLocations = () => {
  const [officeLocations, setOfficeLocations] = useState([]);

  useEffect(() => {
    let active = true;
    api
      .get('/org-settings')
      .then((res) => {
        if (active && res.data.success) {
          setOfficeLocations(
            (res.data.settings?.officeLocations || [])
              .filter((loc) => loc._id)
              .map((loc) => ({ _id: loc._id, name: loc.name || 'Office' }))
          );
        }
      })
      .catch(() => {
        // No list just means the dropdown only offers "Not assigned".
        if (active) setOfficeLocations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return officeLocations;
};

export default useOfficeLocations;
