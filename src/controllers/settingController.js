const Setting = require("../models/Setting");
const User = require("../models/User");
const { sendSuccess, sendError, sendResponse, sendServerError } = require("../utils/apiResponse");

// Main-store ("dash") coverage = the union of every admin account's service
// cities (User.cities), with a Setting.cities fallback. The shop hides
// main-store items for users whose city is not served. An empty array means
// served everywhere (backwards compatible with the previous "show to all").
const getAdminServiceCities = async () => {
	const admins = await User.find({ role: "admin" }).select("cities").lean();
	const fromAdmins = admins.flatMap((a) =>
		Array.isArray(a.cities) ? a.cities : []
	);

	let fromSettings = [];
	try {
		const raw = await Setting.findOne().lean();
		if (raw && Array.isArray(raw.cities)) fromSettings = raw.cities;
	} catch (_) {}

	return [
		...new Set(
			[...fromAdmins, ...fromSettings]
				.map((c) => String(c).trim())
				.filter(Boolean)
		),
	];
};

// @desc    Get global settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
	try {
		const settings = await Setting.getSettings();
		const ras = { settings };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		sendServerError(res, error, "Server Error");
	}
};

// @desc    Update global settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
	try {
		let settings = await Setting.getSettings();

		// Update fields
		if (req.body.isMaintenanceMode !== undefined) {
			settings.isMaintenanceMode = req.body.isMaintenanceMode;
		}
		if (req.body.areOrdersDisabled !== undefined) {
			settings.areOrdersDisabled = req.body.areOrdersDisabled;
		}
		if (req.body.maintenanceMessage !== undefined) {
			settings.maintenanceMessage = req.body.maintenanceMessage;
		}
		if (req.body.minimumOrderValue !== undefined) {
			settings.minimumOrderValue = req.body.minimumOrderValue;
		}
		if (req.body.deliveryZones !== undefined) {
			settings.deliveryZones = Array.isArray(req.body.deliveryZones)
				? [
						...new Set(
							req.body.deliveryZones
								.filter((z) => typeof z === "string")
								.map((z) => z.trim())
								.filter(Boolean)
						),
				  ].slice(0, 60)
				: [];
		}
		if (req.body.deliveryRegions !== undefined) {
			const isValidRegion = (r) =>
				r &&
				typeof r.latitude === "number" &&
				r.latitude >= -90 &&
				r.latitude <= 90 &&
				typeof r.longitude === "number" &&
				r.longitude >= -180 &&
				r.longitude <= 180 &&
				typeof r.radiusKm === "number" &&
				r.radiusKm >= 0.1 &&
				r.radiusKm <= 1000;
			settings.deliveryRegions = Array.isArray(req.body.deliveryRegions)
				? req.body.deliveryRegions
						.filter(isValidRegion)
						.map((r) => ({
							latitude: r.latitude,
							longitude: r.longitude,
							radiusKm: r.radiusKm,
						}))
						.slice(0, 30)
				: [];
		}

		await settings.save();

		const ras = { settings };
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		sendServerError(res, error, "Server Error");
	}
};

// @desc    Get public settings (for shop frontend)
// @route   GET /api/settings/public
// @access  Public
exports.getPublicSettings = async (req, res) => {
	try {
		const settings = await Setting.getSettings();
		const cities = await getAdminServiceCities();
		const ras = {
			isMaintenanceMode: settings.isMaintenanceMode,
			areOrdersDisabled: settings.areOrdersDisabled,
			maintenanceMessage: settings.maintenanceMessage,
			minimumOrderValue: settings.minimumOrderValue,
			// Dash serving cities (array). Empty => main store shown everywhere.
			cities,
			// Dash multi-pin delivery coverage (map pin(s) + radius). Empty =>
			// no range restriction (city rule above still applies).
			deliveryRegions: Array.isArray(settings.deliveryRegions)
				? settings.deliveryRegions
				: [],
		};
		sendResponse(res, 200, true, "Success", ras);
	} catch (error) {
		sendServerError(res, error, "Server Error");
	}
};
