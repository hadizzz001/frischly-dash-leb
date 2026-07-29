const mongoose = require("mongoose");

const marketWasteSchema = new mongoose.Schema(
	{
		market: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Market",
			required: true,
			index: true,
		},
		productName: { type: String, required: true, trim: true, maxlength: 200 },
		barcode: { type: String, trim: true, maxlength: 100 },
		// Reference to the specific product this waste was recorded against, so its
		// stock can be decremented on create and restored on delete. Stored
		// explicitly (rather than relying on barcode) to stay correct even when
		// several products share the same barcode within one market.
		product: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
		quantity: { type: Number, required: true, min: 0 },
		unit: {
			type: String,
			enum: ["pcs", "kg", "g", "l", "ml", "box", "pack"],
			default: "pcs",
		},
		reason: {
			type: String,
			enum: ["expired", "damaged", "spoiled", "stolen", "other"],
			default: "expired",
		},
		costValue: { type: Number, default: 0, min: 0 },
		notes: { type: String, trim: true, maxlength: 500 },
		recordedAt: { type: Date, default: Date.now },
		// Who recorded this waste entry. References the User doc for a
		// market_staff account, or the Market itself when the market owner
		// records it directly (see auth middleware's unified req.user shape).
		recordedBy: {
			type: mongoose.Schema.Types.ObjectId,
			refPath: "recordedByModel",
		},
		recordedByModel: {
			type: String,
			enum: ["User", "Market"],
			default: "User",
		},
		// Denormalized name snapshot so the dashboard can display who recorded
		// the waste even if the user/market is later deleted or renamed.
		recordedByName: { type: String, trim: true, maxlength: 200 },
	},
	{ timestamps: true },
);

marketWasteSchema.index({ market: 1, recordedAt: -1 });
marketWasteSchema.index({ market: 1, reason: 1 });

module.exports = mongoose.model("MarketWaste", marketWasteSchema);
