import { useState, useEffect } from 'react';
import api from '../api/client';

/**
 * Loads departments from Org Settings master data.
 *
 * Several pages used to hardcode the same five department names, so any
 * department created in Org Settings was invisible in their filters.
 */
export const useDepartments = () => {
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    let active = true;
    api
      .get('/departments')
      .then((res) => {
        if (active && res.data.success) {
          setDepartments(res.data.departments || []);
        }
      })
      .catch(() => {
        // A failed lookup just means an "All Departments"-only filter.
        if (active) setDepartments([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return departments;
};

export default useDepartments;
