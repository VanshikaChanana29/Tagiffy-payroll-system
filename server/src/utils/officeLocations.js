const mongoose = require('mongoose');

/**
 * Employees point at an office site by its id (OrgSettings.officeLocations[]._id),
 * so renaming a site carries over to everyone assigned to it. These helpers
 * turn those ids into names and validate what HR sends in.
 */

// [{ _id, name }] for dropdowns and filters.
const listOfficeLocations = (settings) =>
  (settings?.officeLocations || [])
    .filter((loc) => loc._id)
    .map((loc) => ({ _id: loc._id.toString(), name: loc.name || 'Office' }));

// { id: name } lookup.
const officeNameById = (settings) =>
  new Map(listOfficeLocations(settings).map((loc) => [loc._id, loc.name]));

/**
 * Validates an office reference from a form (an id) or a spreadsheet (an id or
 * a site name, any casing). Empty means "not assigned". Returns { value } with
 * an ObjectId or null, or { error } for a 400 response.
 */
const resolveOfficeLocationId = (input, settings) => {
  const raw = String(input ?? '').trim();
  if (!raw || raw === 'none') return { value: null };

  const sites = listOfficeLocations(settings);
  const match =
    sites.find((loc) => loc._id === raw) ||
    sites.find((loc) => loc.name.toLowerCase() === raw.toLowerCase());
  if (!match) {
    return { error: `Office location '${raw}' does not exist. Add it first in Org Settings.` };
  }
  return { value: new mongoose.Types.ObjectId(match._id) };
};

module.exports = { listOfficeLocations, officeNameById, resolveOfficeLocationId };
