const mongoose = require("mongoose");

const pickTrackingSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userRole: {
      type: String,
      enum: ["admin", "manager", "staff", "market", "rider", "market_driver"],
      required: true,
    },
    totalItems: {
      type: Number,
      required: true,
    },
    pickedItems: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: {
          type: Number,
          required: true,
        },
        shelfNumber: {
          type: String,
        },
        pickedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    skippedItems: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        reason: {
          type: String,
          enum: [
            "out_of_stock",
            "damaged",
            "wrong_item",
            "customer_request",
            "unknown",
          ],
          default: "unknown",
        },
        skippedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
pickTrackingSchema.index({ orderId: 1, userId: 1 });
pickTrackingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PickTracking", pickTrackingSchema);
