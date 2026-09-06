const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      default: "Admin",
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // Cloudinary secure URL
    profileImage: {
      type: String,
      default: "",
    },

    // Example: discord/admin/abc123
    profileImagePublicId: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      enum: ["ADMIN"],
      default: "ADMIN",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Admin", adminSchema);
