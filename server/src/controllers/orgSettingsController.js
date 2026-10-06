const mongoose = require('mongoose');
const OrgSettings = require('../models/OrgSettings');
const User = require('../models/User');
const { parseTimeToMinutes } = require('../utils/attendanceRules');
const { parseEarnedPerMonth } = require('../utils/leavePolicy');

// @desc    Read the organisation's work rules
// @route   GET /api/org-settings
// @access  Private (any signed-in user — employees need the shift to see late marks)
const getOrgSettings = async (req, res) => {
  try {
    const settings = await OrgSettings.getSettings();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error('Get Org Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load organisation settings',
      error: error.message,
    });
  }
};

// @desc    Update shift timings and attendance rules
// @route   PUT /api/org-settings
// @access  Private (Admin only)
const updateOrgSettings = async (req, res) => {
  try {
    const {
      companyName,
      shiftStart,
      shiftEnd,
      graceMinutes,
      fullDayHours,
      halfDayHours,
      overtimeAfterHours,
      workingDays,
      salaryStructure,
      leavePolicy,
      officeLocation,
      geofenceRadiusMeters,
      officeLocations,
    } = req.body;

    const settings = await OrgSettings.getSettings();

    const isValidTime = (value) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(value).trim());

    if (shiftStart !== undefined) {
      if (!isValidTime(shiftStart)) {
        return res.status(400).json({
          success: false,
          message: 'Shift start must be a 24-hour time such as 09:30.',
        });
      }
      settings.shiftStart = shiftStart.trim();
    }

    if (shiftEnd !== undefined) {
      if (!isValidTime(shiftEnd)) {
        return res.status(400).json({
          success: false,
          message: 'Shift end must be a 24-hour time such as 18:30.',
        });
      }
      settings.shiftEnd = shiftEnd.trim();
    }

    // A shift that ends before it starts would make every calculation nonsense.
    if (parseTimeToMinutes(settings.shiftEnd) <= parseTimeToMinutes(settings.shiftStart)) {
      return res.status(400).json({
        success: false,
        message: 'Shift end must be later than shift start.',
      });
    }

    const numericFields = {
      graceMinutes,
      fullDayHours,
      halfDayHours,
      overtimeAfterHours,
    };

    for (const [field, value] of Object.entries(numericFields)) {
      if (value === undefined) continue;
      const num = Number(value);
      if (Number.isNaN(num) || num < 0) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a positive number.`,
        });
      }
      settings[field] = num;
    }

    if (settings.halfDayHours >= settings.fullDayHours) {
      return res.status(400).json({
        success: false,
        message: 'Half-day hours must be less than full-day hours.',
      });
    }

    if (settings.overtimeAfterHours < settings.fullDayHours) {
      return res.status(400).json({
        success: false,
        message: 'Overtime cannot start before a full day is worked.',
      });
    }

    if (workingDays !== undefined) {
      const days = Array.isArray(workingDays) ? workingDays.map(Number) : [];
      if (days.length === 0 || days.some((d) => Number.isNaN(d) || d < 0 || d > 6)) {
        return res.status(400).json({
          success: false,
          message: 'Select at least one working day (0 = Sunday through 6 = Saturday).',
        });
      }
      settings.workingDays = [...new Set(days)].sort();
    }

    if (companyName !== undefined && companyName.trim()) {
      settings.companyName = companyName.trim();
    }

    if (salaryStructure !== undefined) {
      if (salaryStructure.lopBasis !== undefined) {
        if (!['calendarDays', 'workingDays'].includes(salaryStructure.lopBasis)) {
          return res.status(400).json({
            success: false,
            message: 'Loss-of-pay basis must be calendarDays or workingDays.',
          });
        }
        settings.salaryStructure.lopBasis = salaryStructure.lopBasis;
      }

      if (salaryStructure.countAbsentAsLop !== undefined) {
        settings.salaryStructure.countAbsentAsLop = !!salaryStructure.countAbsentAsLop;
      }
    }

    // Company default for departments without their own leave policy.
    if (leavePolicy?.earnedPerMonth !== undefined) {
      const { value, error } = parseEarnedPerMonth(leavePolicy.earnedPerMonth);
      if (error) return res.status(400).json({ success: false, message: error });
      settings.leavePolicy.earnedPerMonth = value;
    }

    if (officeLocation !== undefined) {
      const lat = Number(officeLocation.lat);
      const lng = Number(officeLocation.lng);
      const isValidLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
      const isValidLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
      if (!isValidLat || !isValidLng) {
        return res.status(400).json({
          success: false,
          message: 'Office location must have a valid latitude and longitude.',
        });
      }
      settings.officeLocation = {
        lat,
        lng,
        address: officeLocation.address ? String(officeLocation.address).trim() : '',
      };
    }

    if (geofenceRadiusMeters !== undefined) {
      const radius = Number(geofenceRadiusMeters);
      if (Number.isNaN(radius) || radius < 20) {
        return res.status(400).json({
          success: false,
          message: 'Geofence radius must be at least 20 meters.',
        });
      }
      settings.geofenceRadiusMeters = radius;
    }

    if (officeLocations !== undefined) {
      if (!Array.isArray(officeLocations)) {
        return res.status(400).json({
          success: false,
          message: 'officeLocations must be a list of office sites.',
        });
      }

      // Employees are linked to a site by its _id, so an existing site must
      // keep its id across saves; only genuinely new sites get a fresh one.
      const existingIds = new Set((settings.officeLocations || []).map((l) => l._id.toString()));
      const cleaned = [];
      for (const loc of officeLocations) {
        const label = (loc?.name || '').toString().trim() || `Office ${cleaned.length + 1}`;
        const lat = Number(loc?.lat);
        const lng = Number(loc?.lng);
        const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
        const isValidLat = !isBlank(loc?.lat) && Number.isFinite(lat) && lat >= -90 && lat <= 90;
        const isValidLng = !isBlank(loc?.lng) && Number.isFinite(lng) && lng >= -180 && lng <= 180;
        if (!isValidLat || !isValidLng) {
          return res.status(400).json({
            success: false,
            message: `"${label}" needs a valid latitude and longitude.`,
          });
        }

        const radiusMeters = Number(loc?.radiusMeters);
        if (Number.isNaN(radiusMeters) || radiusMeters < 20) {
          return res.status(400).json({
            success: false,
            message: `"${label}" needs a geofence radius of at least 20 meters.`,
          });
        }

        const keepId =
          loc?._id && mongoose.Types.ObjectId.isValid(loc._id) && existingIds.has(String(loc._id));
        cleaned.push({
          ...(keepId && { _id: new mongoose.Types.ObjectId(String(loc._id)) }),
          name: label,
          lat,
          lng,
          address: loc?.address ? String(loc.address).trim() : '',
          radiusMeters,
        });
      }

      // A removed site leaves its employees "Not assigned" rather than
      // pointing at an office that no longer exists.
      const keptIds = new Set(cleaned.filter((l) => l._id).map((l) => l._id.toString()));
      const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
      if (removedIds.length) {
        await User.updateMany(
          { officeLocationId: { $in: removedIds.map((id) => new mongoose.Types.ObjectId(id)) } },
          { $set: { officeLocationId: null } }
        );
      }

      settings.officeLocations = cleaned;
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Work rules updated. New punches will use these settings.',
      settings,
    });
  } catch (error) {
    console.error('Update Org Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update organisation settings',
      error: error.message,
    });
  }
};

module.exports = { getOrgSettings, updateOrgSettings };
