const {
  Client,
  GatewayIntentBits,
} = require("discord.js");

const axios = require("axios");
const cron = require("node-cron");
const mongoose = require("mongoose");

const {
  scanProductImage,
} = require("./imagePriceScannerService");

// =====================================================
// CONFIGURATION
// =====================================================

const BD_TIMEZONE = "Asia/Dhaka";

const SOURCE_CHANNEL_ID =
  process.env.SOURCE_CHANNEL_ID;

const PRICE_TEST_CHANNEL_ID =
  process.env.PRICE_TEST_CHANNEL_ID;

const CONTENT_CHANNEL_ID =
  process.env.CONTENT_CHANNEL_ID || "1243438005444677735";

const DESTINATION_WEBHOOK_URL =
  process.env.DESTINATION_WEBHOOK_URL;

const DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN;

let discordClient = null;

// MongoDB collection.
// No separate model file required.
const RUN_COLLECTION = "order_counter_runs";

// Prevent two recovery checks from running at same time.
let recoveryRunning = false;


// =====================================================
// TC NUMBER
// =====================================================

function extractTCNumbers(text = "") {
  const matches =
    text.match(/\bTC\d+\b/gi) || [];

  return matches.map((tc) =>
    tc.toUpperCase()
  );
}


// =====================================================
// DATE HELPERS
// =====================================================

function formatBDDate(date) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: BD_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}


function makeBDDate(
  year,
  month,
  day,
  hour,
  minute = 0
) {
  // Bangladesh = UTC +6
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - 6,
      minute,
      0,
      0
    )
  );
}


function getBDParts(date = new Date()) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: BD_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(date);

  const obj = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      obj[part.type] =
        Number(part.value);
    }
  }

  return obj;
}


function shiftDate(
  year,
  month,
  day,
  amount
) {
  const d = new Date(
    Date.UTC(
      year,
      month - 1,
      day + amount,
      12,
      0,
      0
    )
  );

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}


function getDateKey(parts) {
  const year =
    String(parts.year);

  const month =
    String(parts.month).padStart(
      2,
      "0"
    );

  const day =
    String(parts.day).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}


// =====================================================
// MONGODB RUN TRACKING
// =====================================================

function getRunCollection() {
  if (
    !mongoose.connection ||
    mongoose.connection.readyState !== 1
  ) {
    throw new Error(
      "MongoDB is not connected"
    );
  }

  return mongoose.connection.collection(
    RUN_COLLECTION
  );
}


async function setupRunCollection() {
  const collection =
    getRunCollection();

  await collection.createIndex(
    {
      runKey: 1,
    },
    {
      unique: true,
    }
  );

  console.log(
    "✅ Order counter duplicate protection ready"
  );
}


/**
 * Claim a report before sending.
 *
 * true  = run
 * false = already sent/running
 */
async function claimRun(
  runKey,
  shiftName,
  reportDate
) {
  const collection =
    getRunCollection();

  const existing =
    await collection.findOne({
      runKey,
    });

  if (existing?.status === "SENT") {
    console.log(
      `⏭️ Already sent: ${runKey}`
    );

    return false;
  }

  // RUNNING lock older than 30 minutes
  // can be retried.
  if (existing?.status === "RUNNING") {
    const updatedAt =
      new Date(
        existing.updatedAt ||
        existing.createdAt
      );

    const age =
      Date.now() -
      updatedAt.getTime();

    const thirtyMinutes =
      30 * 60 * 1000;

    if (age < thirtyMinutes) {
      console.log(
        `⏳ Already running: ${runKey}`
      );

      return false;
    }

    console.log(
      `⚠️ Removing stale lock: ${runKey}`
    );

    await collection.deleteOne({
      runKey,
    });
  }

  if (existing?.status === "FAILED") {
    await collection.deleteOne({
      runKey,
    });
  }

  try {
    await collection.insertOne({
      runKey,
      shiftName,
      reportDate,
      status: "RUNNING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return true;

  } catch (error) {

    if (error.code === 11000) {
      console.log(
        `⏭️ Run already claimed: ${runKey}`
      );

      return false;
    }

    throw error;
  }
}


async function markRunSent(
  runKey,
  orderCount
) {
  const collection =
    getRunCollection();

  await collection.updateOne(
    {
      runKey,
    },
    {
      $set: {
        status: "SENT",
        orderCount,
        sentAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
}


async function releaseRun(
  runKey,
  error
) {
  const collection =
    getRunCollection();

  await collection.updateOne(
    {
      runKey,
    },
    {
      $set: {
        status: "FAILED",
        error:
          error?.message ||
          String(error),
        updatedAt: new Date(),
      },
    }
  );
}


// =====================================================
// FETCH ORDERS FROM DISCORD
// =====================================================

async function getOrdersBetween(
  startTime,
  endTime
) {
  if (
    !discordClient ||
    !discordClient.isReady()
  ) {
    throw new Error(
      "Discord client is not ready"
    );
  }

  const channel =
    await discordClient.channels.fetch(
      SOURCE_CHANNEL_ID
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Source Discord channel is invalid"
    );
  }

  // Map prevents duplicate TC numbers.
  const foundOrders =
    new Map();

  let before = undefined;
  let shouldContinue = true;

  while (shouldContinue) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages.fetch(
        options
      );

    if (!messages.size) {
      break;
    }

    const sorted =
      [...messages.values()].sort(
        (a, b) =>
          b.createdTimestamp -
          a.createdTimestamp
      );

    for (const message of sorted) {
      const timestamp =
        message.createdTimestamp;

      // Ignore messages newer than
      // requested end time.
      if (
        timestamp >=
        endTime.getTime()
      ) {
        continue;
      }

      // Stop when messages become
      // older than requested start time.
      if (
        timestamp <
        startTime.getTime()
      ) {
        shouldContinue = false;
        continue;
      }

      const tcNumbers =
        extractTCNumbers(
          message.content
        );

      for (const tc of tcNumbers) {
        if (!foundOrders.has(tc)) {
          foundOrders.set(
            tc,
            {
              tc,
              timestamp,
            }
          );
        }
      }
    }

    const oldest =
      sorted[
        sorted.length - 1
      ];

    before = oldest.id;

    if (
      oldest.createdTimestamp <
      startTime.getTime()
    ) {
      break;
    }

    if (messages.size < 100) {
      break;
    }
  }

  const orders =
    [...foundOrders.values()].sort(
      (a, b) =>
        a.timestamp -
        b.timestamp
    );

  console.log(
    `📦 Orders found between ${startTime.toISOString()} → ${endTime.toISOString()}: ${orders.length}`
  );

  return orders;
}


// =====================================================
// ORDER RANGE
// =====================================================

function getRangeText(orders) {
  if (!orders.length) {
    return "No orders";
  }

  if (orders.length === 1) {
    return orders[0].tc;
  }

  return (
    `${orders[0].tc}-` +
    `${orders[orders.length - 1].tc}`
  );
}


// =====================================================
// WEBHOOK
// =====================================================

async function sendWebhookMessage(
  content
) {
  if (!DESTINATION_WEBHOOK_URL) {
    throw new Error(
      "DESTINATION_WEBHOOK_URL missing"
    );
  }

  const response =
    await axios.post(
      DESTINATION_WEBHOOK_URL,
      {
        username:
          "TTouch Order Counter",

        content,
      },
      {
        timeout: 15000,
      }
    );

  console.log(
    `✅ Destination webhook response: ${response.status}`
  );
}


// =====================================================
// SHIFT REPORT
// =====================================================

async function sendShiftReport({
  shiftName,
  startTime,
  endTime,
  reportDate,
}) {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    `🚀 ${shiftName} processing`
  );

  console.log(
    `📅 Report date: ${formatBDDate(
      reportDate
    )}`
  );

  console.log(
    `🕐 Start: ${startTime.toISOString()}`
  );

  console.log(
    `🕐 End: ${endTime.toISOString()}`
  );

  const orders =
    await getOrdersBetween(
      startTime,
      endTime
    );

  const range =
    getRangeText(orders);

  const date =
    formatBDDate(reportDate);

  const message =
`${date}

${shiftName}

${range}

Total order ${orders.length}`;

  await sendWebhookMessage(
    message
  );

  console.log(
    `✅ ${shiftName} sent: ${orders.length}`
  );

  console.log(
    "======================================"
  );

  return orders.length;
}


// =====================================================
// DAILY TOTAL
// =====================================================

async function sendDailyTotal(
  startTime,
  endTime,
  reportDate
) {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📊 Daily Total processing"
  );

  const orders =
    await getOrdersBetween(
      startTime,
      endTime
    );

  const range =
    getRangeText(orders);

  const date =
    formatBDDate(reportDate);

  const message =
`${date}

Daily Total

${range}

Total order ${orders.length}`;

  await sendWebhookMessage(
    message
  );

  console.log(
    `✅ Daily total sent: ${orders.length}`
  );

  console.log(
    "======================================"
  );

  return orders.length;
}


// =====================================================
// NIGHT SHIFT
//
// Previous day 9 PM → Current day 2 AM
//
// Example:
// 19 Sep 9 PM → 20 Sep 2 AM
//
// Report sends at 2:00 AM
// =====================================================

async function runNightShiftForDate(
  target
) {
  const yesterday =
    shiftDate(
      target.year,
      target.month,
      target.day,
      -1
    );

  const startTime =
    makeBDDate(
      yesterday.year,
      yesterday.month,
      yesterday.day,
      21
    );

  const endTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      2
    );

  const runKey =
    `${getDateKey(
      target
    )}:night`;

  const claimed =
    await claimRun(
      runKey,
      "Night Shift",
      endTime
    );

  if (!claimed) {
    return;
  }

  try {
    const count =
      await sendShiftReport({
        shiftName:
          "Night Shift",

        startTime,
        endTime,

        reportDate:
          endTime,
      });

    await markRunSent(
      runKey,
      count
    );

  } catch (error) {

    await releaseRun(
      runKey,
      error
    );

    console.error(
      "❌ Night Shift failed:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}


// =====================================================
// MORNING SHIFT
//
// 2 AM → 3 PM
//
// Report sends at 3:00 PM
// =====================================================

async function runMorningShiftForDate(
  target
) {
  const startTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      2
    );

  const endTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      15
    );

  const runKey =
    `${getDateKey(
      target
    )}:morning`;

  const claimed =
    await claimRun(
      runKey,
      "Morning Shift",
      endTime
    );

  if (!claimed) {
    return;
  }

  try {
    const count =
      await sendShiftReport({
        shiftName:
          "Morning Shift",

        startTime,
        endTime,

        reportDate:
          endTime,
      });

    await markRunSent(
      runKey,
      count
    );

  } catch (error) {

    await releaseRun(
      runKey,
      error
    );

    console.error(
      "❌ Morning Shift failed:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}


// =====================================================
// DAY SHIFT
//
// 3 PM → 9 PM
//
// Report sends at 9:00 PM
// =====================================================

async function runDayShiftForDate(
  target
) {
  const startTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      15
    );

  const endTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      21
    );

  const runKey =
    `${getDateKey(
      target
    )}:day`;

  const claimed =
    await claimRun(
      runKey,
      "Day Shift",
      endTime
    );

  if (!claimed) {
    return;
  }

  try {
    const count =
      await sendShiftReport({
        shiftName:
          "Day Shift",

        startTime,
        endTime,

        reportDate:
          endTime,
      });

    await markRunSent(
      runKey,
      count
    );

  } catch (error) {

    await releaseRun(
      runKey,
      error
    );

    console.error(
      "❌ Day Shift failed:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}


// =====================================================
// DAILY TOTAL
//
// Previous day 2 AM → Current day 2 AM
//
// Example:
// 19 Sep 2 AM → 20 Sep 2 AM
//
// Night ends: 2:00 AM
// Daily Total sends: 2:01 AM
// =====================================================

async function runDailyTotalForDate(
  target
) {
  const yesterday =
    shiftDate(
      target.year,
      target.month,
      target.day,
      -1
    );

  const startTime =
    makeBDDate(
      yesterday.year,
      yesterday.month,
      yesterday.day,
      2
    );

  const endTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      2
    );

  const runKey =
    `${getDateKey(
      target
    )}:daily-total`;

  const claimed =
    await claimRun(
      runKey,
      "Daily Total",
      endTime
    );

  if (!claimed) {
    return;
  }

  try {
    const count =
      await sendDailyTotal(
        startTime,
        endTime,
        endTime
      );

    await markRunSent(
      runKey,
      count
    );

  } catch (error) {

    await releaseRun(
      runKey,
      error
    );

    console.error(
      "❌ Daily Total failed:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}


// =====================================================
// NORMAL CRON FUNCTIONS
// =====================================================

async function runNightShift() {
  const target =
    getBDParts(
      new Date()
    );

  await runNightShiftForDate(
    target
  );
}


async function runDailyTotal() {
  const target =
    getBDParts(
      new Date()
    );

  await runDailyTotalForDate(
    target
  );
}


async function runMorningShift() {
  const target =
    getBDParts(
      new Date()
    );

  await runMorningShiftForDate(
    target
  );
}


async function runDayShift() {
  const target =
    getBDParts(
      new Date()
    );

  await runDayShiftForDate(
    target
  );
}


// =====================================================
// MISSED SHIFT RECOVERY
//
// This is NOT server health check.
//
// It runs once when backend starts/restarts.
// It checks completed reports and sends any
// report that was missed while Contabo/backend
// was unavailable.
//
// MongoDB runKey prevents duplicates.
// =====================================================

async function recoverMissedShifts() {

  if (recoveryRunning) {
    console.log(
      "⏭️ Recovery already running"
    );

    return;
  }

  if (
    !discordClient ||
    !discordClient.isReady()
  ) {
    console.log(
      "⏳ Discord not ready. Recovery skipped."
    );

    return;
  }

  recoveryRunning = true;

  try {

    const now =
      new Date();

    const today =
      getBDParts(now);

    console.log("");
    console.log(
      "======================================"
    );

    console.log(
      "🔍 Checking missed order counter reports"
    );

    console.log(
      `🇧🇩 Bangladesh: ${formatBDDate(
        now
      )} ${String(
        today.hour
      ).padStart(
        2,
        "0"
      )}:${String(
        today.minute
      ).padStart(
        2,
        "0"
      )}`
    );


    // ================================================
    // DUE TIMES
    // ================================================

    const nightDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        2,
        0
      );

    const dailyTotalDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        2,
        1
      );

    const morningDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        15,
        0
      );

    const dayDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        21,
        0
      );


    // ================================================
    // NIGHT SHIFT
    // ================================================

    if (
      now.getTime() >=
      nightDue.getTime()
    ) {
      console.log(
        "🔍 Checking Night Shift..."
      );

      try {
        await runNightShiftForDate(
          today
        );
      } catch (error) {
        console.error(
          "❌ Night recovery error:",
          error.message
        );
      }
    }


    // ================================================
    // DAILY TOTAL
    // ================================================

    if (
      now.getTime() >=
      dailyTotalDue.getTime()
    ) {
      console.log(
        "🔍 Checking Daily Total..."
      );

      try {
        await runDailyTotalForDate(
          today
        );
      } catch (error) {
        console.error(
          "❌ Daily Total recovery error:",
          error.message
        );
      }
    }


    // ================================================
    // MORNING SHIFT
    // ================================================

    if (
      now.getTime() >=
      morningDue.getTime()
    ) {
      console.log(
        "🔍 Checking Morning Shift..."
      );

      try {
        await runMorningShiftForDate(
          today
        );
      } catch (error) {
        console.error(
          "❌ Morning recovery error:",
          error.message
        );
      }
    }


    // ================================================
    // DAY SHIFT
    // ================================================

    if (
      now.getTime() >=
      dayDue.getTime()
    ) {
      console.log(
        "🔍 Checking Day Shift..."
      );

      try {
        await runDayShiftForDate(
          today
        );
      } catch (error) {
        console.error(
          "❌ Day recovery error:",
          error.message
        );
      }
    }


    console.log(
      "✅ Missed report check completed"
    );

    console.log(
      "======================================"
    );

  } finally {

    recoveryRunning = false;
  }
}


// =====================================================
// WAIT UNTIL DISCORD READY
// =====================================================

async function waitForDiscordReady() {

  if (
    discordClient &&
    discordClient.isReady()
  ) {
    return;
  }

  await new Promise(
    (resolve, reject) => {

      const timeout =
        setTimeout(
          () => {
            reject(
              new Error(
                "Discord ready timeout"
              )
            );
          },
          30000
        );

      discordClient.once(
        "clientReady",
        () => {

          clearTimeout(
            timeout
          );

          resolve();
        }
      );
    }
  );
}


// =====================================================
// IMAGE TT SCANNER + CONTENT CHANNEL PRICE LOOKUP + COD
//
// NEW FEATURE ONLY.
// Existing order counter / shift / daily total logic is unchanged.
//
// PRICE_TEST_CHANNEL_ID:
//   Receives order/product images.
//   Every attached image is treated as a separate product.
//   Same image / same TT repeated = separate price value.
//
// CONTENT_CHANNEL_ID:
//   Product content channel. Bot searches for matching TT code
//   and reads Price from that message content.
//
// ORDER MESSAGE:
//   DC / dc / Dc / dC is read from the order message.
//   Bot reply contains ONLY:
//   Price: ...
//   COD: product total + DC
// =====================================================

const processingImageMessages = new Set();

function isImageAttachment(attachment) {
  if (attachment.contentType?.startsWith("image/")) {
    return true;
  }

  const filename = attachment.name?.toLowerCase() || "";

  return /\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i.test(filename);
}

function normalizeTTCode(code = "") {
  const match = String(code).match(/TT\s*[-:]?\s*(\d{3,})/i);
  return match ? `TT${match[1]}` : null;
}

function extractPricesFromContent(content = "") {
  const prices = [];
  const regex =
    /(?:^|\n)\s*price\s*[:=\-]?\s*(?:tk\.?|bdt|৳)?\s*([\d,]+(?:\s*\+\s*[\d,]+)*)/gi;

  let match;

  while ((match = regex.exec(content)) !== null) {
    const values = match[1]
      .split("+")
      .map((value) =>
        Number(value.replace(/,/g, "").trim())
      )
      .filter(Number.isFinite);

    prices.push(...values);
  }

  return prices;
}

function extractDeliveryCharge(content = "") {
  const match = String(content).match(
    /(?:^|\n)\s*dc\s*[:=\-]?\s*(?:tk\.?|bdt|৳)?\s*([\d,]+(?:\.\d+)?)/i
  );

  if (!match) {
    return 0;
  }

  const value = Number(
    match[1].replace(/,/g, "")
  );

  return Number.isFinite(value) ? value : 0;
}

function messageContainsTTCode(content = "", ttCode) {
  const wanted = normalizeTTCode(ttCode);

  if (!wanted) {
    return false;
  }

  const compact = String(content)
    .toUpperCase()
    .replace(/[\s\-:]/g, "");

  return compact.includes(wanted);
}

async function findPriceForTTCode(ttCode) {
  if (!CONTENT_CHANNEL_ID) {
    throw new Error("CONTENT_CHANNEL_ID missing");
  }

  const channel =
    await discordClient.channels.fetch(
      CONTENT_CHANNEL_ID
    );

  if (!channel || !channel.isTextBased()) {
    throw new Error(
      "Content Discord channel is invalid"
    );
  }

  // Newest matching product content wins.
  // This is separate from daily order counting.
  let before;
  const maxPages = 20; // up to 2,000 recent messages

  for (
    let page = 0;
    page < maxPages;
    page++
  ) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages.fetch(
        options
      );

    if (!messages.size) {
      break;
    }

    const sorted =
      [...messages.values()].sort(
        (a, b) =>
          b.createdTimestamp -
          a.createdTimestamp
      );

    for (
      const contentMessage of sorted
    ) {
      if (
        !messageContainsTTCode(
          contentMessage.content,
          ttCode
        )
      ) {
        continue;
      }

      const prices =
        extractPricesFromContent(
          contentMessage.content
        );

      if (prices.length) {
        // One image represents one product.
        // If a product content message has multiple price values,
        // use the first price for this product image.
        const price = prices[0];

        console.log(
          `✅ Content match: ${ttCode} -> ${price} (message ${contentMessage.id})`
        );

        return {
          ttCode:
            normalizeTTCode(ttCode),

          price,

          messageId:
            contentMessage.id,
        };
      }
    }

    const oldest =
      sorted[sorted.length - 1];

    before = oldest?.id;

    if (
      !before ||
      messages.size < 100
    ) {
      break;
    }
  }

  return null;
}

async function handleOrderImages(message) {
  // Never process bot messages/replies.
  if (message.author?.bot) {
    return;
  }

  // New price/COD feature runs ONLY in test/image channel.
  // SOURCE_CHANNEL_ID daily counting remains untouched.
  if (
    message.channel.id !==
    PRICE_TEST_CHANNEL_ID
  ) {
    return;
  }

  if (
    processingImageMessages.has(
      message.id
    )
  ) {
    return;
  }

  const images =
    [...message.attachments.values()]
      .filter(
        isImageAttachment
      );

  if (!images.length) {
    return;
  }

  processingImageMessages.add(
    message.id
  );

  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    `📷 New product images: ${images.length}`
  );
  console.log(
    `👤 Moderator: ${message.author.tag}`
  );
  console.log(
    "======================================"
  );

  try {
    try {
      await message.react("🔍");
    } catch (error) {
      console.log(
        "⚠️ Could not add OCR reaction"
      );
    }

    const scanResults = [];

    // IMPORTANT:
    // Scan every attachment separately.
    // No Set / deduplication is used.
    // Same image / same TT repeated remains separate.
    for (
      let i = 0;
      i < images.length;
      i++
    ) {
      const image = images[i];

      console.log(
        `🔍 Scanning image ${i + 1}/${images.length}`
      );

      const result =
        await scanProductImage(
          image.url
        );

      scanResults.push({
        filename:
          image.name ||
          `Image ${i + 1}`,

        ...result,
      });
    }

    const failedTT =
      scanResults.filter(
        (item) =>
          !normalizeTTCode(
            item.ttCode
          )
      );

    // Never calculate partial order when an image TT is missing.
    if (failedTT.length) {
      console.log(
        `⚠️ TT OCR failed for ${failedTT.length}/${images.length} image(s)`
      );

      await message.reply(
        [
          "⚠️ **TT Code Scan Failed**",
          "",
          `Images: ${images.length}`,
          `TT Codes Detected: ${
            images.length -
            failedTT.length
          }`,
          `Failed: ${failedTT.length}`,
          "",
          "Please check the product image(s) manually.",
        ].join("\n")
      );

      return;
    }

    // One lookup/result per image.
    // Same TT is intentionally NOT removed.
    const productResults = [];
    const missingProducts = [];

    for (
      let i = 0;
      i < scanResults.length;
      i++
    ) {
      const code =
        normalizeTTCode(
          scanResults[i].ttCode
        );

      console.log(
        `🔎 Product ${i + 1}/${scanResults.length}: looking up ${code}...`
      );

      const match =
        await findPriceForTTCode(
          code
        );

      if (!match) {
        missingProducts.push({
          imageNumber: i + 1,
          code,
        });

        continue;
      }

      // Push once PER IMAGE.
      // Example:
      // TT12896 image 1 -> 750
      // TT12896 image 2 -> 750
      // TT12896 image 3 -> 750
      productResults.push({
        imageNumber: i + 1,
        code,
        price: match.price,
      });
    }

    if (missingProducts.length) {
      console.log(
        "⚠️ Price content not found:",
        missingProducts
      );

      await message.reply(
        [
          "⚠️ **Price Content Not Found**",
          "",
          `Failed Products: ${missingProducts.length}`,
          `Content Channel: <#${CONTENT_CHANNEL_ID}>`,
          "",
          "Please check the product content manually.",
        ].join("\n")
      );

      return;
    }

    const prices =
      productResults.map(
        (item) => item.price
      );

    const productTotal =
      prices.reduce(
        (sum, price) =>
          sum + price,
        0
      );

    // DC is read from the SAME order/image message.
    // Accepts DC / dc / Dc / dC.
    // Missing DC defaults to 0.
    const dc =
      extractDeliveryCharge(
        message.content
      );

    const cod =
      productTotal + dc;

    // User requested ONLY Price list + COD.
    const response = [
      `Price: ${prices.join(" + ")}`,
      `COD: ${cod}`,
    ];

    await message.reply(
      response.join("\n")
    );

    console.log("");
    console.log(
      "✅ AUTO PRICE + COD SUCCESS"
    );
    console.log(
      "💰 Prices:",
      prices
    );
    console.log(
      "🚚 DC:",
      dc
    );
    console.log(
      "💵 Product Total:",
      productTotal
    );
    console.log(
      "💳 COD:",
      cod
    );

  } catch (error) {
    console.error(
      "❌ Image/content price scanner:",
      error
    );

    try {
      await message.reply(
        "⚠️ Automatic price/COD calculation failed. Please check this order manually."
      );
    } catch {
      // Ignore Discord reply failure.
    }

  } finally {
    processingImageMessages.delete(
      message.id
    );
  }
}


// =====================================================
// START ORDER COUNTER
// =====================================================

async function startOrderCounter() {

  if (!DISCORD_BOT_TOKEN) {
    console.log(
      "⚠️ DISCORD_BOT_TOKEN missing. Order counter disabled."
    );

    return;
  }

  if (!SOURCE_CHANNEL_ID) {
    console.log(
      "⚠️ SOURCE_CHANNEL_ID missing. Order counter disabled."
    );

    return;
  }

  if (!DESTINATION_WEBHOOK_URL) {
    console.log(
      "⚠️ DESTINATION_WEBHOOK_URL missing. Order counter disabled."
    );

    return;
  }


  // MongoDB must already be connected.
  await setupRunCollection();


  discordClient =
    new Client({
      intents: [
        GatewayIntentBits.Guilds,

        GatewayIntentBits
          .GuildMessages,

        GatewayIntentBits
          .MessageContent,
      ],
    });


  // ===================================================
  // IMAGE PRICE LISTENER
  //
  // Added independently from existing shift logic.
  // ===================================================

  discordClient.on(
    "messageCreate",
    async (message) => {
      try {
        await handleOrderImages(
          message
        );
      } catch (error) {
        console.error(
          "❌ messageCreate OCR error:",
          error.message
        );
      }
    }
  );


  discordClient.once(
    "clientReady",
    () => {

      console.log(
        `🤖 Discord bot logged in as ${discordClient.user.tag}`
      );

      console.log(
        "✅ TTouch Order Counter started"
      );

      console.log(
        "🌅 Morning: 2 AM - 3 PM"
      );

      console.log(
        "☀️ Day: 3 PM - 9 PM"
      );

      console.log(
        "🌙 Night: 9 PM - 2 AM"
      );

      console.log(
        "📊 Daily Total: 2 AM - 2 AM"
      );

      console.log(
        "📊 Daily Total sends at 2:01 AM"
      );

      console.log(
        "✅ Timezone: Asia/Dhaka"
      );

      console.log(
        "✅ Contabo deployment mode"
      );

      console.log(
        "🚫 15-minute health/recovery cron disabled"
      );
    }
  );


  await discordClient.login(
    DISCORD_BOT_TOKEN
  );

  await waitForDiscordReady();


  // ===================================================
  // NIGHT SHIFT
  // Every day at 02:00 AM Bangladesh time
  // ===================================================

  cron.schedule(
    "0 2 * * *",

    async () => {

      console.log(
        "⏰ NIGHT SHIFT CRON FIRED - 2:00 AM BD"
      );

      try {

        await runNightShift();

      } catch (error) {

        console.error(
          "❌ Night cron error:",
          error.message
        );
      }
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );


  // ===================================================
  // DAILY TOTAL
  // Every day at 02:01 AM Bangladesh time
  //
  // Exactly 1 minute after Night Shift ends.
  // ===================================================

  cron.schedule(
    "1 2 * * *",

    async () => {

      console.log(
        "⏰ DAILY TOTAL CRON FIRED - 2:01 AM BD"
      );

      try {

        await runDailyTotal();

      } catch (error) {

        console.error(
          "❌ Daily Total cron error:",
          error.message
        );
      }
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );


  // ===================================================
  // MORNING SHIFT
  // Every day at 03:00 PM Bangladesh time
  // ===================================================

  cron.schedule(
    "0 15 * * *",

    async () => {

      console.log(
        "⏰ MORNING SHIFT CRON FIRED - 3:00 PM BD"
      );

      try {

        await runMorningShift();

      } catch (error) {

        console.error(
          "❌ Morning cron error:",
          error.message
        );
      }
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );


  // ===================================================
  // DAY SHIFT
  // Every day at 09:00 PM Bangladesh time
  // ===================================================

  cron.schedule(
    "0 21 * * *",

    async () => {

      console.log(
        "⏰ DAY SHIFT CRON FIRED - 9:00 PM BD"
      );

      try {

        await runDayShift();

      } catch (error) {

        console.error(
          "❌ Day cron error:",
          error.message
        );
      }
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );


  // ===================================================
  // IMPORTANT
  //
  // OLD:
  //
  // cron.schedule(
  //   "*/15 * * * *",
  //   recoverMissedShifts
  // );
  //
  // REMOVED.
  //
  // No 15-minute scheduled health/recovery check.
  // Backend is running on Contabo.
  // ===================================================


  console.log(
    "⏰ Order Counter cron jobs registered"
  );

  console.log(
    "🌙 Night report: 2:00 AM"
  );

  console.log(
    "📊 Daily total: 2:01 AM"
  );

  console.log(
    "🌅 Morning report: 3:00 PM"
  );

  console.log(
    "☀️ Day report: 9:00 PM"
  );

  console.log(
    "🚫 15-minute scheduled check removed"
  );


  // ===================================================
  // STARTUP RECOVERY
  //
  // Only runs when Contabo backend starts/restarts.
  // It does NOT run every 15 minutes.
  // ===================================================

  try {

    await recoverMissedShifts();

  } catch (error) {

    console.error(
      "❌ Initial recovery failed:",
      error.message
    );
  }
}


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  startOrderCounter,

  // Manual testing
  runNightShift,
  runDailyTotal,
  runMorningShift,
  runDayShift,

  recoverMissedShifts,
};
