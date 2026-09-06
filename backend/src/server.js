const dotenv = require("dotenv");
const path = require("path");

// =====================================================
// LOAD ENV FIRST
// =====================================================

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// =====================================================
// DEBUG ENV
// Remove this block later if you want
// =====================================================

console.log("Cloudinary ENV:", {
  cloudName:
    process.env.CLOUDINARY_CLOUD_NAME,

  apiKeyLoaded:
    Boolean(
      process.env.CLOUDINARY_API_KEY
    ),

  apiSecretLoaded:
    Boolean(
      process.env.CLOUDINARY_API_SECRET
    ),
});

// =====================================================
// IMPORTS AFTER ENV IS LOADED
// =====================================================

const dns = require("dns");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");

const {
  connectDB,
} = require("./config/db");

const authRoutes =
  require("./routes/authRoutes");

const webhookRoutes =
  require("./routes/webhookRoutes");

const messageRoutes =
  require("./routes/messageRoutes");

const {
  ensureAdmin,
} = require("./utils/ensureAdmin");

// =====================================================
// DNS
// =====================================================

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

// =====================================================
// CONFIG
// =====================================================

const PORT =
  process.env.PORT || 5000;

const BD_TIMEZONE =
  "Asia/Dhaka";

const SERVER_URL =
  process.env.SERVER_URL ||
  `http://localhost:${PORT}`;

// =====================================================
// HEALTH API CRON FUNCTION
// =====================================================

async function callHealthApi(
  jobName
) {
  try {
    const url =
      `${SERVER_URL}/api/health`;

    const bdTime =
      new Date().toLocaleString(
        "en-US",
        {
          timeZone:
            BD_TIMEZONE,
        }
      );

    console.log("");

    console.log(
      "======================================"
    );

    console.log(
      `⏰ ${jobName}`
    );

    console.log(
      `🇧🇩 Bangladesh Time: ${bdTime}`
    );

    console.log(
      `🔗 Calling: ${url}`
    );

    console.log(
      "======================================"
    );

    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          Accept:
            "application/json",
        },
      });

    if (!response.ok) {
      throw new Error(
        `Health API returned HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    console.log(
      "✅ Health API called successfully"
    );

    console.log(
      "Response:",
      data
    );
  } catch (error) {
    console.error(
      `❌ ${jobName} health check failed:`,
      error.message
    );
  }
}

// =====================================================
// CRON JOBS
// =====================================================

function startCronJobs() {
  // -------------------------------------------------
  // EVERY DAY AT 3:46 PM BANGLADESH TIME
  // -------------------------------------------------

  cron.schedule(
    "46 15 * * *",

    async () => {
      await callHealthApi(
        "3:46 PM Bangladesh Cron"
      );
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );

  // -------------------------------------------------
  // EVERY DAY AT 4:10 PM BANGLADESH TIME
  // -------------------------------------------------

  cron.schedule(
    "10 16 * * *",

    async () => {
      await callHealthApi(
        "4:10 PM Bangladesh Cron"
      );
    },

    {
      timezone:
        BD_TIMEZONE,
    }
  );

  console.log("");

  console.log(
    "======================================"
  );

  console.log(
    "⏰ CRON JOBS REGISTERED"
  );

  console.log(
    "======================================"
  );

  console.log(
    "✅ Health check: Every day at 3:46 PM BD"
  );

  console.log(
    "✅ Health check: Every day at 4:10 PM BD"
  );

  console.log(
    `🌏 Timezone: ${BD_TIMEZONE}`
  );

  console.log(
    `🔗 Server URL: ${SERVER_URL}`
  );

  console.log(
    "======================================"
  );

  console.log("");
}

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
    // =================================================
    // MONGODB CONNECTION
    // =================================================

    await connectDB(
      process.env.MONGO_URI
    );

    console.log(
      "✅ MongoDB connected"
    );

    // =================================================
    // ENSURE ADMIN EXISTS
    // =================================================

    await ensureAdmin();

    console.log(
      "✅ Admin check completed"
    );

    // =================================================
    // EXPRESS
    // =================================================

    const app = express();

    app.set(
      "trust proxy",
      1
    );

    // =================================================
    // SECURITY
    // =================================================

    app.use(
      helmet()
    );

    // =================================================
    // CORS
    // =================================================

    app.use(
      cors({
        origin:
          process.env.CLIENT_URL ||
          "http://localhost:5173",

        credentials:
          false,
      })
    );

    // =================================================
    // JSON BODY PARSER
    // =================================================

    app.use(
      express.json({
        limit: "3mb",
      })
    );

    // =================================================
    // GLOBAL RATE LIMIT
    // =================================================

    app.use(
      rateLimit({
        windowMs:
          60 * 1000,

        limit:
          180,

        standardHeaders:
          true,

        legacyHeaders:
          false,
      })
    );

    // =================================================
    // HEALTH CHECK
    // =================================================

    app.get(
      "/api/health",

      (_req, res) => {
        const now =
          new Date();

        const bangladeshTime =
          now.toLocaleString(
            "en-US",
            {
              timeZone:
                BD_TIMEZONE,
            }
          );

        console.log(
          `💓 Health API called | BD: ${bangladeshTime}`
        );

        res.json({
          ok: true,

          message:
            "Server is healthy",

          timestamp:
            now.toISOString(),

          bangladeshTime,

          timezone:
            BD_TIMEZONE,
        });
      }
    );

    // =================================================
    // API ROUTES
    // =================================================

    app.use(
      "/api/auth",
      authRoutes
    );

    app.use(
      "/api/webhooks",
      webhookRoutes
    );

    app.use(
      "/api/messages",
      messageRoutes
    );

    // =================================================
    // 404 HANDLER
    // =================================================

    app.use(
      (req, res) => {
        res
          .status(404)
          .json({
            message:
              "API route not found",

            method:
              req.method,

            path:
              req.originalUrl,
          });
      }
    );

    // =================================================
    // ERROR HANDLER
    // =================================================

    app.use(
      (
        err,
        _req,
        res,
        _next
      ) => {
        console.error(
          "❌ Server error:",
          err
        );

        res
          .status(
            err.status ||
            500
          )
          .json({
            message:
              process.env.NODE_ENV ===
              "production"
                ? "Internal server error"
                : err.message ||
                  "Internal server error",
          });
      }
    );

    // =================================================
    // START EXPRESS SERVER
    // =================================================

    app.listen(
      PORT,

      () => {
        console.log("");

        console.log(
          "======================================"
        );

        console.log(
          `✅ Server running on port ${PORT}`
        );

        console.log(
          `✅ Health: ${SERVER_URL}/api/health`
        );

        console.log(
          "✅ Auth: /api/auth"
        );

        console.log(
          "✅ Webhooks: /api/webhooks"
        );

        console.log(
          "✅ Messages: /api/messages"
        );

        console.log(
          "======================================"
        );

        // =============================================
        // START CRON JOBS
        // =============================================

        startCronJobs();
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to start server"
    );

    console.error(
      "message:",
      error.message
    );

    process.exit(1);
  }
}

// =====================================================
// BOOTSTRAP
// =====================================================

startServer();