const router = require("express").Router();

const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");

const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/authController");

// =====================================================
// LOGIN RATE LIMIT
// =====================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
// PROFILE IMAGE VALIDATION
//
// Frontend sends:
// 1. Base64 for a newly selected image
// 2. Existing Cloudinary URL during edit
// 3. Empty string to remove image
// =====================================================

function validateProfileImage(value) {
  if (!value) {
    return true;
  }

  const base64ImageRegex =
    /^data:image\/(png|jpeg|jpg|webp);base64,/i;

  if (base64ImageRegex.test(value)) {
    const base64Data =
      value.split(",")[1] || "";

    const padding =
      (base64Data.match(/=*$/) || [""])[0].length;

    const sizeInBytes =
      (base64Data.length * 3) / 4 -
      padding;

    const maxSize =
      2 * 1024 * 1024;

    if (sizeInBytes > maxSize) {
      throw new Error(
        "Profile image must be smaller than 2 MB"
      );
    }

    return true;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol === "https:" &&
      url.hostname ===
        "res.cloudinary.com"
    ) {
      return true;
    }
  } catch {
    // handled below
  }

  throw new Error(
    "Profile image must be a Base64 image, Cloudinary URL, or empty"
  );
}

// =====================================================
// LOGIN
// =====================================================

router.post(
  "/login",
  loginLimiter,

  body("email")
    .trim()
    .isEmail()
    .withMessage(
      "Enter a valid email"
    ),

  body("password")
    .isString()
    .isLength({ min: 6 })
    .withMessage(
      "Password must be at least 6 characters"
    ),

  validate,
  controller.login
);

// =====================================================
// GET LOGGED-IN ADMIN
// =====================================================

router.get(
  "/me",
  auth,
  controller.me
);

// =====================================================
// UPDATE OWN PROFILE
// =====================================================

router.put(
  "/profile",
  auth,

  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({
      min: 2,
      max: 80,
    })
    .withMessage(
      "Name must be between 2 and 80 characters"
    ),

  body("profileImage")
    .optional()
    .isString()
    .custom(validateProfileImage),

  validate,
  controller.updateProfile
);

// =====================================================
// CHANGE PASSWORD
// =====================================================

router.post(
  "/change-password",
  auth,

  body("currentPassword")
    .isString()
    .notEmpty()
    .withMessage(
      "Current password is required"
    ),

  body("newPassword")
    .isString()
    .isLength({
      min: 8,
      max: 128,
    })
    .withMessage(
      "New password must be 8-128 characters"
    )
    .matches(/[A-Z]/)
    .withMessage(
      "New password needs an uppercase letter"
    )
    .matches(/[a-z]/)
    .withMessage(
      "New password needs a lowercase letter"
    )
    .matches(/[0-9]/)
    .withMessage(
      "New password needs a number"
    ),

  validate,
  controller.changePassword
);

// =====================================================
// USER MANAGEMENT
// =====================================================

router.get(
  "/users",
  auth,
  controller.listUsers
);

router.post(
  "/users",
  auth,

  body("name")
    .isString()
    .trim()
    .isLength({
      min: 2,
      max: 80,
    })
    .withMessage(
      "Name must be between 2 and 80 characters"
    ),

  body("email")
    .trim()
    .isEmail()
    .withMessage(
      "Enter a valid email"
    ),

  body("password")
    .isString()
    .isLength({
      min: 8,
      max: 128,
    })
    .withMessage(
      "Password must be 8-128 characters"
    )
    .matches(/[A-Z]/)
    .withMessage(
      "Password needs an uppercase letter"
    )
    .matches(/[a-z]/)
    .withMessage(
      "Password needs a lowercase letter"
    )
    .matches(/[0-9]/)
    .withMessage(
      "Password needs a number"
    ),

  body("profileImage")
    .optional()
    .isString()
    .custom(validateProfileImage),

  validate,
  controller.createUser
);

router.put(
  "/users/:id",
  auth,

  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({
      min: 2,
      max: 80,
    })
    .withMessage(
      "Name must be between 2 and 80 characters"
    ),

  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage(
      "Enter a valid email"
    ),

  body("password")
    .optional({
      checkFalsy: true,
    })
    .isString()
    .isLength({
      min: 8,
      max: 128,
    })
    .withMessage(
      "Password must be 8-128 characters"
    )
    .matches(/[A-Z]/)
    .withMessage(
      "Password needs an uppercase letter"
    )
    .matches(/[a-z]/)
    .withMessage(
      "Password needs a lowercase letter"
    )
    .matches(/[0-9]/)
    .withMessage(
      "Password needs a number"
    ),

  body("profileImage")
    .optional()
    .isString()
    .custom(validateProfileImage),

  validate,
  controller.updateUser
);

router.delete(
  "/users/:id",
  auth,
  controller.deleteUser
);

module.exports = router;
