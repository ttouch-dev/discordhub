const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["ADMIN"], default: "ADMIN" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
