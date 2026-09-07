const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const dns = require("dns");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");

const { connectDB } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const messageRoutes = require("./routes/messageRoutes");

const { ensureAdmin } = require("./utils/ensureAdmin");

const {
  startOrderCounter,
} = require("./services/orderCounterService");

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

const PORT =
  process.env.PORT || 5000;

const BD_TIMEZONE =
  "Asia/Dhaka";

const SERVER_URL =
  process.env.SERVER_URL ||
  `http://localhost:${PORT}`;

async function callHealthApi() {
  try {
    const url =
      `${SERVER_URL}/api/health`;

    const response =
      await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
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
      "✅ Health check:",
      data.bangladeshTime
    );
  } catch (error) {
    console.error(
      "❌ Health check failed:",
      error.message
    );
  }
}

function startHealthCron() {
  cron.schedule(
    "*/15 * * * *",
    async () => {
      await callHealthApi();
    },
    {
      timezone: BD_TIMEZONE,
    }
  );

  console.log(
    "✅ Health check scheduled every 15 minutes"
  );
}

async function startServer() {
  try {
    await connectDB(
      process.env.MONGO_URI
    );

    console.log(
      "✅ MongoDB connected"
    );

    await ensureAdmin();

    console.log(
      "✅ Admin check completed"
    );

    const app = express();

    app.set(
      "trust proxy",
      1
    );

    app.use(
      helmet()
    );

    app.use(
      cors({
        origin:
          process.env.CLIENT_URL ||
          "http://localhost:5173",

        credentials:
          false,
      })
    );

    app.use(
      express.json({
        limit: "3mb",
      })
    );

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
            err.status || 500
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

    app.listen(
      PORT,
      async () => {
        console.log(
          `✅ Server running on port ${PORT}`
        );

        console.log(
          `✅ Health URL: ${SERVER_URL}/api/health`
        );

        startHealthCron();

        await startOrderCounter();
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error.message
    );

    process.exit(1);
  }
}

startServer();