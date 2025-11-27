const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  isMaintenanceMode: {
    type: Boolean,
    default: false
  },
  areOrdersDisabled: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: "We are currently undergoing maintenance. Please check back later."
  }
}, { timestamps: true });

// Ensure only one document exists
SettingSchema.statics.getSettings = async function() {
  const setting = await this.findOne();
  if (setting) {
    return setting;
  }
  return await this.create({});
};

module.exports = mongoose.model('Setting', SettingSchema);
