const router = require("express").Router();

const { body } = require("express-validator");

const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/messageController");

router.use(auth);

router.post(
  "/broadcast",

  body("message")
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Message must be 1-2000 characters"),

  body("webhookIds")
    .optional()
    .isArray()
    .withMessage("webhookIds must be an array"),

  body("webhookIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid webhook id"),

  validate,

  controller.broadcast
);

module.exports = router;