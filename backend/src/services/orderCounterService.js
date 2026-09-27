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

const RUN_COLLECTION = "order_counter_runs";

let recoveryRunning = false;

function extractTCNumbers(text = "") {

  const matches =

    text.match(/\bTC\d+\b/gi) || [];

  return matches.map((tc) =>

    tc.toUpperCase()

  );

}

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

      if (

        timestamp >=

        endTime.getTime()

      ) {

        continue;

      }

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

function getRangeText(orders) {

  if (!orders.length) {

    return "No orders";

  }if (orders.length === 1) {

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

  }}

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

    /(?:^|\n)\s*price\s*[:=\-]?\s*(?:tk.?|bdt|৳)?\s*([\d,]+(?:\s*\+\s*[\d,]+)*)/gi;

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

    /(?:^|\n)\s*dc\s*[:=\-]?\s*(?:tk.?|bdt|৳)?\s*([\d,]+(?:\.\d+)?)/i

  );

  if (!match) {

    return 0;

  }

  const value = Number(

    match[1].replace(/,/g, "")

  );

  return Number.isFinite(value) ? value : 0;

}

function extractAdvancePayment(content = "") {
  if (!content) {
    return 0;
  }

  const text = String(content);

  // Supported formats:
  //
  // Advance 1000
  // Advanced 1000
  // Adv 1000
  //
  // Advance: 1000
  // Advanced: 1000
  // Adv: 1000
  //
  // Advance = 1000
  // Advanced = 1000
  // Adv = 1000
  //
  // Advance - 1000
  // Advanced - 1000
  //
  // Advance Tk 1000
  // Advanced Tk 1000
  //
  // Advance BDT 1000
  // Advanced BDT 1000
  //
  // Advance ৳1000
  // Advanced ৳1000
  //
  // Advanced 1,000

  const match = text.match(
    /(?:^|\n)\s*(?:advance|advanced|adv)\s*[:=\-]?\s*(?:tk\.?|bdt|৳)?\s*([\d,]+)/i
  );

  if (!match) {
    return 0;
  }

  const value = Number(
    match[1].replace(/,/g, "")
  );

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
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

  let before;

  const maxPages = 20; 

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

        const price = prices[0];

        console.log(

          `✅ Content match: ${ttCode} -> ${price} (message ${contentMessage.id})`

        );

        return {

          ttCode:

            normalizeTTCode(ttCode),

          price,

          messageId:

            contentMessage.id,};

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

  if (message.author?.bot) {

    return;

  }

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

    for (let i = 0; i < images.length; i++) {

      const image = images[i];

      console.log(

        `🔍 Scanning image ${i + 1}/${images.length}`

      );

      const result = await scanProductImage(image.url);

      scanResults.push({

        imageIndex: i,

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

    const productResults = [];

    const missingProducts = [];

    const priceCache = new Map();

    for (let i = 0; i < scanResults.length; i++) {

      const code = normalizeTTCode(scanResults[i].ttCode);

      let match;

      if (priceCache.has(code)) {

        match = priceCache.get(code);

        console.log(`⚡ Cached content price: ${code}`);

      } else {

        match = await findPriceForTTCode(code);

        priceCache.set(code, match);

      }

      if (!match) { missingProducts.push({ imageNumber: i + 1, code }); continue; }

      productResults.push({ imageNumber: i + 1, code, price: match.price });

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

    const dc =

      extractDeliveryCharge(

        message.content

      );

    const advance =

      extractAdvancePayment(

        message.content

      );

    const cod = Math.max(

      0,

      productTotal + dc - advance

    );

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

      "💸 Advance:",

      advance

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

    }

  } finally {

    processingImageMessages.delete(

      message.id

    );

  }

}

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

  cron.schedule(

    "0 21 * * *",

    async () => {

      console.log(

        "⏰ DAY SHIFT CRON FIRED - 9:00 PM BD"

      );

      try {await runDayShift();

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

  try {

    await recoverMissedShifts();

  } catch (error) {

    console.error(

      "❌ Initial recovery failed:",

      error.message

    );

  }

}

module.exports = {

  startOrderCounter,

  runNightShift,

  runDailyTotal,

  runMorningShift,

  runDayShift,

  recoverMissedShifts,

};
