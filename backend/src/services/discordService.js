const axios = require("axios");

const {
  decryptText,
} = require("../utils/crypto");

// =====================================================
// CONFIG
// =====================================================

const DEFAULT_BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES = 500;
const MAX_RETRIES = 5;

// =====================================================
// SLEEP
// =====================================================

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

// =====================================================
// VALIDATE URL
// =====================================================

function isValidHttpUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

// =====================================================
// GET RETRY DELAY
// Discord may return retry_after in seconds
// =====================================================

function getRetryDelay(response) {
  const retryAfter =
    response?.data?.retry_after;

  if (
    typeof retryAfter === "number" &&
    retryAfter > 0
  ) {
    // Discord retry_after is normally seconds.
    return Math.ceil(
      retryAfter * 1000
    );
  }

  const header =
    response?.headers?.[
      "retry-after"
    ];

  if (header) {
    const seconds =
      Number(header);

    if (
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      return Math.ceil(
        seconds * 1000
      );
    }
  }

  return 1500;
}

// =====================================================
// CREATE DISCORD PAYLOAD
// =====================================================

function createPayload(
  message,
  sender
) {
  const payload = {
    content: message,

    allowed_mentions: {
      parse: [],
    },
  };

  // Logged-in admin name
  if (sender?.name) {
    payload.username =
      String(sender.name)
        .trim()
        .slice(0, 80);
  }

  // Logged-in admin Cloudinary profile image
  if (
    isValidHttpUrl(
      sender?.avatarUrl
    )
  ) {
    payload.avatar_url =
      sender.avatarUrl;
  }

  return payload;
}

// =====================================================
// SEND ONE SELECTED WEBHOOK
// =====================================================

async function sendOne(
  webhook,
  message,
  sender = {}
) {
  let webhookUrl;

  try {
    webhookUrl =
      decryptText(
        webhook.encryptedUrl
      );
  } catch (error) {
    return {
      webhookId:
        webhook._id,

      webhookName:
        webhook.name,

      group:
        webhook.group,

      status:
        "FAILED",

      statusCode:
        null,

      errorMessage:
        "Could not decrypt webhook URL",
    };
  }

  if (
    !isValidHttpUrl(
      webhookUrl
    )
  ) {
    return {
      webhookId:
        webhook._id,

      webhookName:
        webhook.name,

      group:
        webhook.group,

      status:
        "FAILED",

      statusCode:
        null,

      errorMessage:
        "Invalid webhook URL",
    };
  }

  const payload =
    createPayload(
      message,
      sender
    );

  // ===================================================
  // RETRY LOOP
  // ===================================================

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const response =
        await axios.post(
          webhookUrl,
          payload,
          {
            timeout: 15000,

            validateStatus:
              () => true,
          }
        );

      // ===============================================
      // SUCCESS
      // Discord normally returns 204
      // ===============================================

      if (
        response.status >= 200 &&
        response.status < 300
      ) {
        console.log(
          `✅ ${webhook.name} sent successfully`
        );

        return {
          webhookId:
            webhook._id,

          webhookName:
            webhook.name,

          group:
            webhook.group,

          status:
            "SUCCESS",

          statusCode:
            response.status,

          errorMessage:
            null,
        };
      }

      // ===============================================
      // DISCORD RATE LIMIT
      // ===============================================

      if (
        response.status === 429
      ) {
        const waitMs =
          getRetryDelay(
            response
          );

        console.log(
          `⏳ ${webhook.name} rate limited. Retrying in ${waitMs}ms (${attempt}/${MAX_RETRIES})`
        );

        if (
          attempt <
          MAX_RETRIES
        ) {
          await sleep(
            waitMs + 250
          );

          continue;
        }

        return {
          webhookId:
            webhook._id,

          webhookName:
            webhook.name,

          group:
            webhook.group,

          status:
            "FAILED",

          statusCode:
            429,

          errorMessage:
            "Discord rate limit retry limit reached",
        };
      }

      // ===============================================
      // OTHER DISCORD ERROR
      // ===============================================

      console.error(
        `❌ ${webhook.name}:`,
        response.status,
        response.data
      );

      return {
        webhookId:
          webhook._id,

        webhookName:
          webhook.name,

        group:
          webhook.group,

        status:
          "FAILED",

        statusCode:
          response.status,

        errorMessage:
          response.data
            ?.message ||
          `Discord returned HTTP ${response.status}`,

        discordError:
          response.data,
      };
    } catch (error) {
      console.error(
        `❌ ${webhook.name} request error:`,
        error.response?.data ||
          error.message
      );

      // Retry network/server failures
      if (
        attempt <
        MAX_RETRIES
      ) {
        await sleep(
          1000 * attempt
        );

        continue;
      }

      return {
        webhookId:
          webhook._id,

        webhookName:
          webhook.name,

        group:
          webhook.group,

        status:
          "FAILED",

        statusCode:
          error.response
            ?.status ||
          null,

        errorMessage:
          error.response
            ?.data
            ?.message ||
          error.message ||
          "Request failed",
      };
    }
  }

  return {
    webhookId:
      webhook._id,

    webhookName:
      webhook.name,

    group:
      webhook.group,

    status:
      "FAILED",

    statusCode:
      null,

    errorMessage:
      "Unknown sending error",
  };
}

// =====================================================
// SEND ALL SELECTED WEBHOOKS
//
// IMPORTANT:
// NO URL DEDUPLICATION
// NO CHANNEL DEDUPLICATION
//
// 100 selected webhook records =
// 100 send attempts.
// =====================================================

async function sendInBatches(
  webhooks,
  message,
  sender = {},
  batchSize =
    DEFAULT_BATCH_SIZE
) {
  const results = [];

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    `📡 Broadcast starting`
  );

  console.log(
    `📡 Selected webhooks: ${webhooks.length}`
  );

  console.log(
    `📦 Batch size: ${batchSize}`
  );

  console.log(
    "======================================"
  );

  for (
    let i = 0;
    i < webhooks.length;
    i += batchSize
  ) {
    const batch =
      webhooks.slice(
        i,
        i + batchSize
      );

    const batchNumber =
      Math.floor(
        i / batchSize
      ) + 1;

    const totalBatches =
      Math.ceil(
        webhooks.length /
          batchSize
      );

    console.log(
      `📦 Batch ${batchNumber}/${totalBatches}`
    );

    // Send this batch concurrently
    const batchResults =
      await Promise.all(
        batch.map(
          (webhook) =>
            sendOne(
              webhook,
              message,
              sender
            )
        )
      );

    results.push(
      ...batchResults
    );

    // Delay before next batch
    if (
      i + batchSize <
      webhooks.length
    ) {
      await sleep(
        DELAY_BETWEEN_BATCHES
      );
    }
  }

  const successCount =
    results.filter(
      (item) =>
        item.status ===
        "SUCCESS"
    ).length;

  const failedCount =
    results.length -
    successCount;

  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📡 BROADCAST FINISHED"
  );

  console.log(
    `✅ Success: ${successCount}`
  );

  console.log(
    `❌ Failed: ${failedCount}`
  );

  console.log(
    `📊 Total: ${results.length}`
  );

  console.log(
    "======================================"
  );

  return results;
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  sendInBatches,
};