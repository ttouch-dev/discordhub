const axios = require("axios");
const { decryptText } = require("../utils/crypto");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendOne(webhook, message) {
  const url = decryptText(webhook.encryptedUrl);
  try {
    const response = await axios.post(
      url,
      { content: message, allowed_mentions: { parse: [] } },
      { timeout: 15000, validateStatus: () => true }
    );

    if (response.status >= 200 && response.status < 300) {
      return {
        webhookId: webhook._id,
        webhookName: webhook.name,
        group: webhook.group,
        status: "SUCCESS",
        statusCode: response.status,
        errorMessage: null,
      };
    }

    return {
      webhookId: webhook._id,
      webhookName: webhook.name,
      group: webhook.group,
      status: "FAILED",
      statusCode: response.status,
      errorMessage: response.data?.message || `Discord returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      webhookId: webhook._id,
      webhookName: webhook.name,
      group: webhook.group,
      status: "FAILED",
      statusCode: error.response?.status || null,
      errorMessage: error.response?.data?.message || error.message || "Request failed",
    };
  }
}

async function sendInBatches(webhooks, message, batchSize = 5) {
  const results = [];
  for (let i = 0; i < webhooks.length; i += batchSize) {
    const batch = webhooks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((w) => sendOne(w, message)));
    results.push(...batchResults);
    if (i + batchSize < webhooks.length) await sleep(350);
  }
  return results;
}

module.exports = { sendInBatches };
