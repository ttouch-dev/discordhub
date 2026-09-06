const mongoose = require("mongoose");

const Webhook = require("../models/Webhook");

const {
  sendInBatches,
} = require("../services/discordService");

exports.broadcast = async (req, res) => {
  try {
    const {
      message,
      webhookIds,
    } = req.body;

    const filter = {
      isActive: true,
    };

    if (
      Array.isArray(webhookIds) &&
      webhookIds.length > 0
    ) {
      const ids =
        webhookIds.filter((id) =>
          mongoose.Types.ObjectId.isValid(
            id
          )
        );

      filter._id = {
        $in: ids,
      };
    }

    const webhooks =
      await Webhook.find(filter);

    if (!webhooks.length) {
      return res.status(400).json({
        message:
          "No active webhooks selected",
      });
    }

    // profileImage is now a public Cloudinary URL.
    const sender = {
      name:
        req.admin?.name ||
        req.admin?.email ||
        "Admin",

      avatarUrl:
        req.admin?.profileImage ||
        undefined,
    };

    const results =
      await sendInBatches(
        webhooks,
        message.trim(),
        sender
      );

    const successCount =
      results.filter(
        (item) =>
          item.status === "SUCCESS"
      ).length;

    const failedCount =
      results.length -
      successCount;

    return res.json({
      message:
        failedCount > 0
          ? "Broadcast finished with some failures"
          : "Broadcast sent successfully",

      totalWebhooks:
        results.length,

      successCount,

      failedCount,

      sender,

      results,
    });
  } catch (error) {
    console.error(
      "Broadcast error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to send broadcast",
    });
  }
};
