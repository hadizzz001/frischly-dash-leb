const Setting = require("../models/Setting");
const User = require("../models/User");

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
		res.status(200).json({
			success: true,
			data: settings,
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Server Error",
		});
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

		await settings.save();

		res.status(200).json({
			success: true,
			data: settings,
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Server Error",
		});
	}
};

// @desc    Get public settings (for shop frontend)
// @route   GET /api/settings/public
// @access  Public
exports.getPublicSettings = async (req, res) => {
	try {
		const settings = await Setting.getSettings();
		const cities = await getAdminServiceCities();
		res.status(200).json({
			success: true,
			data: {
				isMaintenanceMode: settings.isMaintenanceMode,
				areOrdersDisabled: settings.areOrdersDisabled,
				maintenanceMessage: settings.maintenanceMessage,
				minimumOrderValue: settings.minimumOrderValue,
				// Dash serving cities (array). Empty => main store shown everywhere.
				cities,
			},
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Server Error",
		});
	}
};
