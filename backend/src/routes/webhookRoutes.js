const router = require("express").Router();
const { body, param } = require("express-validator");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/webhookController");

const discordWebhookRegex = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+(?:\?.*)?$/i;

router.use(auth);
router.get("/", controller.list);
router.post(
  "/",
  body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Name must be 2-80 characters"),
  body("group").optional().trim().isLength({ max: 40 }).withMessage("Group is too long"),
  body("webhookUrl").matches(discordWebhookRegex).withMessage("Enter a valid Discord webhook URL"),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  validate,
  controller.create
);
router.put(
  "/:id",
  param("id").isMongoId().withMessage("Invalid webhook id"),
  body("name").optional().trim().isLength({ min: 2, max: 80 }).withMessage("Name must be 2-80 characters"),
  body("group").optional().trim().isLength({ max: 40 }).withMessage("Group is too long"),
  body("webhookUrl").optional({ checkFalsy: true }).matches(discordWebhookRegex).withMessage("Enter a valid Discord webhook URL"),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean"),
  validate,
  controller.update
);
router.delete(
  "/:id",
  param("id").isMongoId().withMessage("Invalid webhook id"),
  validate,
  controller.remove
);

module.exports = router;
