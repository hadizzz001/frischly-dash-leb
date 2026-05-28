const mongoose = require("mongoose");

const marketRiderSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		name: { type: String, required: true, trim: true, maxlength: 100 },
		phoneNumber: { type: String, required: true, trim: true, maxlength: 30 },
		email: { type: String, trim: true, lowercase: true },
		vehicleType: {
			type: String,
			enum: ["bike", "scooter", "car", "van", "other"],
			default: "scooter",
		},
		vehiclePlate: { type: String, trim: true, maxlength: 30 },
		zone: { type: String, trim: true, maxlength: 100 },
		isActive: { type: Boolean, default: true },
		isAvailable: { type: Boolean, default: true },
		notes: { type: String, trim: true, maxlength: 500 },
	},
	{ timestamps: true },
);

marketRiderSchema.index({ market: 1, phoneNumber: 1 }, { unique: true });
marketRiderSchema.index({ market: 1, isActive: 1 });

module.exports = mongoose.model("MarketRider", marketRiderSchema);
