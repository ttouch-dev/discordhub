const {
  Client,
  GatewayIntentBits,
} = require("discord.js");

const axios = require("axios");
const cron = require("node-cron");

const BD_TIMEZONE = "Asia/Dhaka";

const SOURCE_CHANNEL_ID =
  process.env.SOURCE_CHANNEL_ID;

const DESTINATION_WEBHOOK_URL =
  process.env.DESTINATION_WEBHOOK_URL;

const DISCORD_BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN;

let discordClient = null;

/**
 * TC128849
 * TC128850
 * etc.
 */
function extractTCNumbers(text = "") {
  const matches =
    text.match(/\bTC\d+\b/gi) || [];

  return matches.map((tc) =>
    tc.toUpperCase()
  );
}

/**
 * Date formatter:
 * 07/09/2026
 */
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

/**
 * Build Bangladesh timestamp from
 * YYYY-MM-DD + hour/minute.
 *
 * Bangladesh = UTC+6
 */
function makeBDDate(
  year,
  month,
  day,
  hour,
  minute = 0
) {
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

/**
 * Get current Bangladesh date parts.
 */
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

/**
 * Add/subtract days safely.
 */
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

/**
 * Fetch all messages between:
 * start <= message < end
 *
 * Count UNIQUE TC numbers only.
 */
async function getOrdersBetween(
  startTime,
  endTime
) {
  if (!discordClient) {
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

  const foundOrders = new Map();

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

      // newer than range
      if (
        timestamp >=
        endTime.getTime()
      ) {
        continue;
      }

      // older than range
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
          foundOrders.set(tc, {
            tc,
            timestamp,
          });
        }
      }
    }

    const oldest =
      sorted[sorted.length - 1];

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
        a.timestamp - b.timestamp
    );

  return orders;
}

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

async function sendWebhookMessage(
  content
) {
  await axios.post(
    DESTINATION_WEBHOOK_URL,
    {
      username:
        "TTouch Order Counter",

      content,
    }
  );
}

/**
 * Send individual shift report.
 */
async function sendShiftReport({
  shiftName,
  startTime,
  endTime,
  reportDate,
}) {
  try {
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
      `✅ ${shiftName} sent:`,
      orders.length
    );
  } catch (error) {
    console.error(
      `❌ ${shiftName} failed:`,
      error.response?.data ||
        error.message
    );
  }
}

/**
 * Separate final daily report.
 *
 * Business day:
 * previous day 9 PM
 *        ↓
 * current day 9 PM
 */
async function sendDailyTotal(
  startTime,
  endTime,
  reportDate
) {
  try {
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
      "✅ Daily total sent:",
      orders.length
    );
  } catch (error) {
    console.error(
      "❌ Daily total failed:",
      error.response?.data ||
        error.message
    );
  }
}

/**
 * 03:00 AM
 *
 * Night Shift:
 * previous day 9 PM
 * → current day 3 AM
 */
async function runNightShift() {
  const now = new Date();

  const {
    year,
    month,
    day,
  } = getBDParts(now);

  const yesterday =
    shiftDate(
      year,
      month,
      day,
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
      year,
      month,
      day,
      3
    );

  await sendShiftReport({
    shiftName: "Night Shift",
    startTime,
    endTime,
    reportDate: endTime,
  });
}

/**
 * 03:00 PM
 *
 * Morning Shift:
 * 3 AM → 3 PM
 */
async function runMorningShift() {
  const now = new Date();

  const {
    year,
    month,
    day,
  } = getBDParts(now);

  const startTime =
    makeBDDate(
      year,
      month,
      day,
      3
    );

  const endTime =
    makeBDDate(
      year,
      month,
      day,
      15
    );

  await sendShiftReport({
    shiftName:
      "Morning Shift",
    startTime,
    endTime,
    reportDate: endTime,
  });
}

/**
 * 09:00 PM
 *
 * Day Shift:
 * 3 PM → 9 PM
 *
 * Then separate Daily Total.
 */
async function runDayShift() {
  const now = new Date();

  const {
    year,
    month,
    day,
  } = getBDParts(now);

  const yesterday =
    shiftDate(
      year,
      month,
      day,
      -1
    );

  const shiftStart =
    makeBDDate(
      year,
      month,
      day,
      15
    );

  const shiftEnd =
    makeBDDate(
      year,
      month,
      day,
      21
    );

  // 1. Day Shift
  await sendShiftReport({
    shiftName: "Day Shift",
    startTime: shiftStart,
    endTime: shiftEnd,
    reportDate: shiftEnd,
  });

  // 2. Daily total separately
  const dailyStart =
    makeBDDate(
      yesterday.year,
      yesterday.month,
      yesterday.day,
      21
    );

  const dailyEnd =
    shiftEnd;

  await sendDailyTotal(
    dailyStart,
    dailyEnd,
    dailyEnd
  );
}

/**
 * Start Discord bot + schedules.
 */
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

  // 03:00 AM
  cron.schedule(
    "0 3 * * *",
    runNightShift,
    {
      timezone:
        BD_TIMEZONE,
    }
  );

  // 03:00 PM
  cron.schedule(
    "0 15 * * *",
    runMorningShift,
    {
      timezone:
        BD_TIMEZONE,
    }
  );

  // 09:00 PM
  cron.schedule(
    "0 21 * * *",
    runDayShift,
    {
      timezone:
        BD_TIMEZONE,
    }
  );

  console.log(
    "⏰ Order Counter cron jobs registered"
  );
}

module.exports = {
  startOrderCounter,

  // আমরা test করার জন্য এগুলোও export করছি
  runNightShift,
  runMorningShift,
  runDayShift,
};