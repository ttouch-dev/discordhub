const router = require("express").Router();
const { body } = require("express-validator");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/authController");

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post(
  "/login",
  loginLimiter,
  body("email").isEmail().withMessage("Enter a valid email"),
  body("password").isString().isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  validate,
  controller.login
);
router.get("/me", auth, controller.me);
router.post(
  "/change-password",
  auth,
  body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isString()
    .isLength({ min: 8 })
    .matches(/[A-Z]/).withMessage("New password needs an uppercase letter")
    .matches(/[a-z]/).withMessage("New password needs a lowercase letter")
    .matches(/[0-9]/).withMessage("New password needs a number"),
  validate,
  controller.changePassword
);

module.exports = router;
