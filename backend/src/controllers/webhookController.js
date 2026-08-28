const Webhook = require("../models/Webhook");
const { encryptText, maskWebhookUrl } = require("../utils/crypto");

function normalizeGroup(value) {
  return String(value || "GENERAL").trim().toUpperCase() || "GENERAL";
}

exports.list = async (_req, res) => {
  const webhooks = await Webhook.find().sort({ group: 1, name: 1 }).lean();
  res.json({ webhooks: webhooks.map(({ encryptedUrl, ...w }) => w) });
};

exports.create = async (req, res) => {
  const { name, group, webhookUrl, isActive = true } = req.body;
  const webhook = await Webhook.create({
    name: name.trim(),
    group: normalizeGroup(group),
    encryptedUrl: encryptText(webhookUrl.trim()),
    maskedUrl: maskWebhookUrl(webhookUrl.trim()),
    isActive: Boolean(isActive),
  });
  const obj = webhook.toObject();
  delete obj.encryptedUrl;
  res.status(201).json({ message: "Webhook added", webhook: obj });
};

exports.update = async (req, res) => {
  const webhook = await Webhook.findById(req.params.id);
  if (!webhook) return res.status(404).json({ message: "Webhook not found" });

  if (typeof req.body.name === "string") webhook.name = req.body.name.trim();
  if (typeof req.body.group === "string") webhook.group = normalizeGroup(req.body.group);
  if (typeof req.body.isActive === "boolean") webhook.isActive = req.body.isActive;
  if (typeof req.body.webhookUrl === "string" && req.body.webhookUrl.trim()) {
    webhook.encryptedUrl = encryptText(req.body.webhookUrl.trim());
    webhook.maskedUrl = maskWebhookUrl(req.body.webhookUrl.trim());
  }
  await webhook.save();
  const obj = webhook.toObject();
  delete obj.encryptedUrl;
  res.json({ message: "Webhook updated", webhook: obj });
};

exports.remove = async (req, res) => {
  const webhook = await Webhook.findByIdAndDelete(req.params.id);
  if (!webhook) return res.status(404).json({ message: "Webhook not found" });
  res.json({ message: "Webhook deleted" });
};
