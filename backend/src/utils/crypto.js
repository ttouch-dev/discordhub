const crypto = require("crypto");

function getKey() {
  const hex = process.env.WEBHOOK_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptText(payload) {
  const [ivHex, tagHex, encryptedHex] = String(payload || "").split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("Invalid encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function maskWebhookUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id = parts[2] || "webhook";
    return `${parsed.origin}/api/webhooks/${id}/********`;
  } catch {
    return "********";
  }
}

module.exports = { encryptText, decryptText, maskWebhookUrl };
