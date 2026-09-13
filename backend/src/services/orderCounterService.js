const {
  Client,
  GatewayIntentBits,
} = require("discord.js");

const axios = require("axios");
const cron = require("node-cron");
const mongoose = require("mongoose");

const BD_TIMEZONE = "Asia/Dhaka";

const SOURCE_CHANNEL_ID =
  process.env.SOURCE_CHANNEL_ID;

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
// No model required
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
 * Claim a shift before sending.
 *
 * Returns true  = run the shift
 * Returns false = already sent/running
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

  // If old RUNNING lock exists for more
  // than 30 minutes, allow retry.
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
// FETCH ORDERS
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

      // Message newer than requested range
      if (
        timestamp >=
        endTime.getTime()
      ) {
        continue;
      }

      // Message older than requested range
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
    "🚀 Daily Total processing"
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
// Report date = day that ends at 3 AM
//
// Previous day 9 PM
//        ↓
// Current day 3 AM
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
      3
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
// 3 AM → 3 PM
// =====================================================

async function runMorningShiftForDate(
  target
) {
  const startTime =
    makeBDDate(
      target.year,
      target.month,
      target.day,
      3
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
// Previous day 9 PM → Current day 9 PM
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
      21
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

  await runDailyTotalForDate(
    target
  );
}


// =====================================================
// MISSED SHIFT RECOVERY
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
      "🔍 Checking missed order counter shifts"
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

    /*
     * Current day's completed shifts only.
     *
     * Example:
     * 4 PM:
     * Night + Morning are eligible.
     *
     * 10 PM:
     * Night + Morning + Day + Daily Total.
     */

    const nightDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        3
      );

    const morningDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        15
      );

    const dayDue =
      makeBDDate(
        today.year,
        today.month,
        today.day,
        21
      );

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

    console.log(
      "✅ Missed shift check completed"
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

  if (
    !DESTINATION_WEBHOOK_URL
  ) {
    console.log(
      "⚠️ DESTINATION_WEBHOOK_URL missing. Order counter disabled."
    );

    return;
  }

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
        "✅ Night: 9 PM - 3 AM"
      );

      console.log(
        "✅ Morning: 3 AM - 3 PM"
      );

      console.log(
        "✅ Day: 3 PM - 9 PM"
      );

      console.log(
        "✅ Timezone: Asia/Dhaka"
      );
    }
  );

  await discordClient.login(
    DISCORD_BOT_TOKEN
  );

  await waitForDiscordReady();


  // ===================================================
  // 03:00 AM
  // ===================================================

  cron.schedule(
    "0 3 * * *",
    async () => {
      console.log(
        "⏰ NIGHT SHIFT CRON FIRED - 3:00 AM BD"
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
  // 03:00 PM
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
  // 09:00 PM
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
  // RECOVERY CHECK
  // Every 15 minutes
  // ===================================================

  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await recoverMissedShifts();
      } catch (error) {
        console.error(
          "❌ Recovery cron error:",
          error.message
        );
      }
    },
    {
      timezone:
        BD_TIMEZONE,
    }
  );


  console.log(
    "⏰ Order Counter cron jobs registered"
  );

  console.log(
    "🔄 Missed shift recovery: Every 15 minutes"
  );


  // Check immediately after Render starts/restarts.
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
  runMorningShift,
  runDayShift,

  recoverMissedShifts,
};