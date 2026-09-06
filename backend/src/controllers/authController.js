const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Admin = require("../models/Admin");

const {
  isBase64Image,
  isCloudinaryUrl,
  uploadAdminProfileImage,
  deleteCloudinaryImage,
} = require("../services/cloudinaryService");

// =====================================================
// TOKEN
// =====================================================

function signToken(admin) {
  return jwt.sign(
    {
      sub: admin._id.toString(),
      role: admin.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN || "30d",
    }
  );
}

// =====================================================
// RESPONSE FORMAT
// =====================================================

function adminData(admin) {
  return {
    id: admin._id,
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    profileImage: admin.profileImage || "",
    role: admin.role,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

// =====================================================
// PROFILE IMAGE HELPER
// =====================================================

async function replaceProfileImage(admin, incomingImage) {
  if (typeof incomingImage !== "string") {
    return;
  }

  // Empty string = remove current image
  if (!incomingImage) {
    const oldPublicId = admin.profileImagePublicId;

    admin.profileImage = "";
    admin.profileImagePublicId = "";

    if (oldPublicId) {
      await deleteCloudinaryImage(oldPublicId);
    }

    return;
  }

  // Existing Cloudinary URL sent unchanged from frontend.
  // Keep it as-is.
  if (
    isCloudinaryUrl(incomingImage) &&
    incomingImage === admin.profileImage
  ) {
    return;
  }

  // Frontend sends a newly selected image as Base64.
  if (isBase64Image(incomingImage)) {
    const oldPublicId = admin.profileImagePublicId;

    const uploaded =
      await uploadAdminProfileImage(incomingImage);

    admin.profileImage = uploaded.url;
    admin.profileImagePublicId =
      uploaded.publicId;

    if (oldPublicId) {
      await deleteCloudinaryImage(oldPublicId);
    }

    return;
  }

  throw new Error(
    "Profile image must be a new Base64 image, an existing Cloudinary URL, or empty"
  );
}

// =====================================================
// LOGIN
// =====================================================

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({
      email: email.trim().toLowerCase(),
    });

    if (
      !admin ||
      !(await bcrypt.compare(
        password,
        admin.passwordHash
      ))
    ) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    return res.json({
      token: signToken(admin),
      admin: adminData(admin),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Failed to login",
    });
  }
};

// =====================================================
// GET LOGGED-IN ADMIN
// =====================================================

exports.me = async (req, res) => {
  try {
    return res.json({
      admin: adminData(req.admin),
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      message: "Failed to load profile",
    });
  }
};

// =====================================================
// UPDATE OWN PROFILE
// =====================================================

exports.updateProfile = async (req, res) => {
  try {
    const {
      name,
      profileImage,
    } = req.body;

    const admin = await Admin.findById(
      req.admin._id
    );

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (
      typeof name === "string" &&
      name.trim()
    ) {
      admin.name = name.trim();
    }

    try {
      await replaceProfileImage(
        admin,
        profileImage
      );
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    await admin.save();

    return res.json({
      message:
        "Profile updated successfully",
      admin: adminData(admin),
    });
  } catch (error) {
    console.error(
      "Update profile error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update profile",
    });
  }
};

// =====================================================
// CHANGE PASSWORD
// =====================================================

exports.changePassword = async (
  req,
  res
) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body;

    const admin = await Admin.findById(
      req.admin._id
    );

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        admin.passwordHash
      );

    if (!passwordMatches) {
      return res.status(400).json({
        message:
          "Current password is incorrect",
      });
    }

    admin.passwordHash =
      await bcrypt.hash(
        newPassword,
        12
      );

    await admin.save();

    return res.json({
      message:
        "Password changed successfully",
    });
  } catch (error) {
    console.error(
      "Change password error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to change password",
    });
  }
};

// =====================================================
// GET ALL USERS
// =====================================================

exports.listUsers = async (
  req,
  res
) => {
  try {
    const users =
      await Admin.find()
        .select(
          "_id name email profileImage role createdAt updatedAt"
        )
        .sort({
          createdAt: -1,
        });

    return res.json({
      users: users.map(adminData),
    });
  } catch (error) {
    console.error(
      "List users error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load users",
    });
  }
};

// =====================================================
// CREATE USER
// =====================================================

exports.createUser = async (
  req,
  res
) => {
  let uploadedPublicId = "";

  try {
    const {
      name,
      email,
      password,
      profileImage = "",
    } = req.body;

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    const exists =
      await Admin.findOne({
        email: normalizedEmail,
      });

    if (exists) {
      return res.status(409).json({
        message:
          "A user with this email already exists",
      });
    }

    let imageUrl = "";
    let imagePublicId = "";

    if (profileImage) {
      if (!isBase64Image(profileImage)) {
        return res.status(400).json({
          message:
            "New user profile image must be a Base64 image",
        });
      }

      const uploaded =
        await uploadAdminProfileImage(
          profileImage
        );

      imageUrl = uploaded.url;
      imagePublicId =
        uploaded.publicId;
      uploadedPublicId =
        uploaded.publicId;
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    const user =
      await Admin.create({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        profileImage: imageUrl,
        profileImagePublicId:
          imagePublicId,
        role: "ADMIN",
      });

    return res
      .status(201)
      .json({
        message:
          "User added successfully",
        user: adminData(user),
      });
  } catch (error) {
    if (uploadedPublicId) {
      await deleteCloudinaryImage(
        uploadedPublicId
      );
    }

    console.error(
      "Create user error:",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "A user with this email already exists",
      });
    }

    return res.status(500).json({
      message:
        "Failed to add user",
    });
  }
};

// =====================================================
// UPDATE USER
// =====================================================

exports.updateUser = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user =
      await Admin.findById(id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const {
      name,
      email,
      password,
      profileImage,
    } = req.body;

    if (
      typeof name === "string" &&
      name.trim()
    ) {
      user.name = name.trim();
    }

    if (
      typeof email === "string" &&
      email.trim()
    ) {
      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const duplicate =
        await Admin.findOne({
          email: normalizedEmail,
          _id: {
            $ne: user._id,
          },
        });

      if (duplicate) {
        return res.status(409).json({
          message:
            "A user with this email already exists",
        });
      }

      user.email = normalizedEmail;
    }

    try {
      await replaceProfileImage(
        user,
        profileImage
      );
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (
      typeof password === "string" &&
      password.trim()
    ) {
      user.passwordHash =
        await bcrypt.hash(
          password,
          12
        );
    }

    await user.save();

    return res.json({
      message:
        "User updated successfully",
      user: adminData(user),
      isCurrentUser:
        user._id.toString() ===
        req.admin._id.toString(),
    });
  } catch (error) {
    console.error(
      "Update user error:",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "A user with this email already exists",
      });
    }

    return res.status(500).json({
      message:
        "Failed to update user",
    });
  }
};

// =====================================================
// DELETE USER
// =====================================================

exports.deleteUser = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Current logged-in admin cannot delete themself.
    if (
      id === req.admin._id.toString()
    ) {
      return res.status(400).json({
        message:
          "You cannot delete your own account",
      });
    }

    const user =
      await Admin.findById(id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const oldPublicId =
      user.profileImagePublicId;

    await user.deleteOne();

    if (oldPublicId) {
      await deleteCloudinaryImage(
        oldPublicId
      );
    }

    return res.json({
      message:
        "User deleted successfully",
      deletedUserId: id,
    });
  } catch (error) {
    console.error(
      "Delete user error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to delete user",
    });
  }
};
