const dotenv = require("dotenv");
const dns = require("dns");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { connectDB } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const messageRoutes = require("./routes/messageRoutes");

const { ensureAdmin } = require("./utils/ensureAdmin");

// Load local .env when available.
// On Render, environment variables are injected directly.
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // MongoDB connection
    await connectDB(process.env.MONGO_URI);

    // Ensure admin exists
    await ensureAdmin();

    const app = express();

    app.set("trust proxy", 1);

    // Security middleware
    app.use(helmet());

    // CORS
    app.use(
      cors({
        origin:
          process.env.CLIENT_URL ||
          "http://localhost:5173",
        credentials: false,
      })
    );

    // JSON body parser
    app.use(
      express.json({
        limit: "100kb",
      })
    );

    // Global rate limit
    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        limit: 180,
        standardHeaders: true,
        legacyHeaders: false,
      })
    );

    // =========================
    // HEALTH CHECK
    // =========================

    app.get("/api/health", (_req, res) => {
      res.json({
        ok: true,
      });
    });

    // =========================
    // API ROUTES
    // =========================

    app.use("/api/auth", authRoutes);
    app.use("/api/webhooks", webhookRoutes);
    app.use("/api/messages", messageRoutes);

    // =========================
    // 404 HANDLER
    // =========================

    app.use((req, res) => {
      res.status(404).json({
        message: "API route not found",
        method: req.method,
        path: req.originalUrl,
      });
    });

    // =========================
    // ERROR HANDLER
    // =========================

    app.use((err, _req, res, _next) => {
      console.error("❌ Server error:", err);

      res.status(err.status || 500).json({
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message || "Internal server error",
      });
    });

    // =========================
    // START SERVER
    // =========================

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Health: /api/health`);
      console.log(`✅ Auth: /api/auth`);
      console.log(`✅ Webhooks: /api/webhooks`);
      console.log(`✅ Messages: /api/messages`);
    });
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error("message:", error.message);
    process.exit(1);
  }
}

startServer();