const mongoose = require("mongoose");

const webhookSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    group: { type: String, trim: true, uppercase: true, default: "GENERAL", maxlength: 40 },
    encryptedUrl: { type: String, required: true },
    maskedUrl: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Webhook", webhookSchema);
