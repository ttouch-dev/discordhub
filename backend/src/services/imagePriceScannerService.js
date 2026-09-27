const axios = require("axios");
const sharp = require("sharp");

let paddleService = null;
let paddleServicePromise = null;

// =====================================================
// PADDLE OCR SERVICE
// =====================================================

async function getPaddleService() {
  if (paddleService) {
    return paddleService;
  }

  if (!paddleServicePromise) {
    paddleServicePromise = (async () => {
      console.log("🚀 Starting PaddleOCR...");

      const paddle = await import("ppu-paddle-ocr");

      const {
        PaddleOcrService,
        V6_SMALL_MODEL,
        V6_MEDIUM_MODEL,
        V6_TINY_MODEL,
      } = paddle;

      const requested = String(
        process.env.OCR_MODEL || "small"
      ).toLowerCase();

      let model = V6_SMALL_MODEL;

      if (requested === "medium") {
        model = V6_MEDIUM_MODEL;
      } else if (requested === "tiny") {
        model = V6_TINY_MODEL;
      }

      console.log(`🧠 OCR model: PP-OCRv6 ${requested}`);

      // IMPORTANT:
      // Do NOT use canvas-native here.
      // Let PaddleOCR use its Node/OpenCV processing path.
      const service = new PaddleOcrService({
        model,

        recognition: {
          strategy: "per-line",
        },

        debugging: {
          debug: false,
          verbose: false,
        },
      });

      await service.initialize();

      paddleService = service;

      console.log(
        `✅ PaddleOCR ready (PP-OCRv6 ${requested})`
      );

      return service;
    })().catch((error) => {
      paddleServicePromise = null;

      console.error(
        "❌ PaddleOCR initialization failed:",
        error.message
      );

      throw error;
    });
  }

  return paddleServicePromise;
}

// =====================================================
// DOWNLOAD IMAGE
// =====================================================

async function downloadImage(url) {
  if (!url) {
    throw new Error("Image URL is required");
  }

  console.log("⬇️ Downloading Discord image...");

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,

    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,

    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "image/*,*/*;q=0.8",
    },
  });

  const buffer = Buffer.from(response.data);

  if (!buffer.length) {
    throw new Error("Downloaded image is empty");
  }

  console.log(
    `📥 Image downloaded: ${(buffer.length / 1024).toFixed(1)} KB`
  );

  return buffer;
}

// =====================================================
// NORMALIZE OCR CHARACTERS
// =====================================================

function normalizePossibleDigits(value = "") {
  return String(value)
    .toUpperCase()
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0")
    .replace(/Q/g, "0")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/G/g, "6");
}

// =====================================================
// EXTRACT TT CODE
//
// VALID:
// TT12345
//
// SAFE:
// T T 12345
// TT12B45 -> TT12845
// TTI2345 -> TT12345
//
// REJECT:
// 1112345
// 1712345
// TT1 79
// missing-digit guesses
// =====================================================

function extractTTCode(text = "") {
  if (!text) {
    return null;
  }

  const upper = String(text)
    .toUpperCase()
    .replace(/\r/g, "\n");

  // ===================================================
  // 1. EXACT TT12345
  // ===================================================

  let match = upper.match(
    /(?:^|[^A-Z0-9])TT\s*[-:]?\s*(\d{5})(?!\d)/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(`✅ Exact TT detected: ${code}`);

    return code;
  }

  // ===================================================
  // 2. T T 12345
  // ===================================================

  match = upper.match(
    /(?:^|[^A-Z0-9])T[\s._|:-]+T[\s._|:-]*(\d{5})(?!\d)/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(`✅ Separated TT detected: ${code}`);

    return code;
  }

  // ===================================================
  // 3. TT + OCR CONFUSED DIGITS
  //
  // TT12B45 -> TT12845
  // ===================================================

  match = upper.match(
    /(?:^|[^A-Z0-9])TT\s*[-:]?\s*([0-9ILOQSBZG]{5})(?![0-9A-Z])/i
  );

  if (match) {
    const digits =
      normalizePossibleDigits(match[1]);

    if (/^\d{5}$/.test(digits)) {
      const code = `TT${digits}`;

      console.log(
        `⚠️ TT OCR digit correction: ${code}`
      );

      return code;
    }
  }

  // ===================================================
  // 4. SECOND T CONFUSED
  //
  // TI12345
  // T112345
  // ===================================================

  match = upper.match(
    /(?:^|[^A-Z0-9])T[\s._|:-]*[T1I][\s._|:-]*([0-9ILOQSBZG]{5})(?![0-9A-Z])/i
  );

  if (match) {
    const digits =
      normalizePossibleDigits(match[1]);

    if (/^\d{5}$/.test(digits)) {
      const code = `TT${digits}`;

      console.log(
        `⚠️ TT prefix correction: ${code}`
      );

      return code;
    }
  }

  return null;
}

// =====================================================
// COLLECT OCR TEXT
// =====================================================

function collectText(result) {
  if (!result) {
    return "";
  }

  const parts = [];

  // Direct text
  if (
    typeof result.text === "string" &&
    result.text.trim()
  ) {
    parts.push(result.text.trim());
  }

  // Lines
  if (Array.isArray(result.lines)) {
    for (const line of result.lines) {
      if (
        typeof line === "string" &&
        line.trim()
      ) {
        parts.push(line.trim());
      }

      if (
        line &&
        typeof line.text === "string" &&
        line.text.trim()
      ) {
        parts.push(line.text.trim());
      }
    }
  }

  // Items
  if (Array.isArray(result.items)) {
    for (const item of result.items) {
      if (
        item &&
        typeof item.text === "string" &&
        item.text.trim()
      ) {
        parts.push(item.text.trim());
      }
    }
  }

  // Results
  if (Array.isArray(result.results)) {
    for (const item of result.results) {
      if (
        item &&
        typeof item.text === "string" &&
        item.text.trim()
      ) {
        parts.push(item.text.trim());
      }
    }
  }

  // Recursive fallback for slightly different
  // PaddleOCR response structures.
  function walk(value, depth = 0) {
    if (!value || depth > 4) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (
      typeof value.text === "string" &&
      value.text.trim()
    ) {
      parts.push(value.text.trim());
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        key === "text" ||
        key === "image" ||
        key === "buffer"
      ) {
        continue;
      }

      walk(child, depth + 1);
    }
  }

  walk(result);

  return [
    ...new Set(
      parts
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ].join("\n");
}

// =====================================================
// IMAGE INFO
// =====================================================

async function getImageInfo(buffer) {
  const metadata =
    await sharp(buffer).metadata();

  if (
    !metadata.width ||
    !metadata.height
  ) {
    throw new Error(
      "Could not read image dimensions"
    );
  }

  console.log(
    `🖼️ Image size: ${metadata.width}x${metadata.height}`
  );

  return metadata;
}

// =====================================================
// PREPARE NORMAL OCR IMAGE
//
// We do NOT unnecessarily upscale the first pass.
// This keeps it fast.
// =====================================================

async function prepareOriginalImage(buffer) {
  const metadata =
    await getImageInfo(buffer);

  let targetWidth =
    metadata.width;

  // Large screenshots do not need full resolution
  // for the first detection pass.
  if (targetWidth > 1800) {
    targetWidth = 1800;
  }

  let pipeline =
    sharp(buffer, {
      failOn: "none",
    }).rotate();

  if (
    metadata.width >
    targetWidth
  ) {
    pipeline =
      pipeline.resize({
        width: targetWidth,
        withoutEnlargement: true,
        fit: "inside",
      });
  }

  return pipeline
    .png({
      compressionLevel: 6,
    })
    .toBuffer();
}

// =====================================================
// ENHANCED FALLBACK
//
// Only runs when normal OCR fails.
// =====================================================

async function buildEnhancedImage(buffer) {
  const metadata =
    await sharp(buffer).metadata();

  const width =
    metadata.width || 0;

  let targetWidth;

  if (width < 1000) {
    targetWidth =
      Math.min(
        width * 2,
        2000
      );
  } else if (width < 1600) {
    targetWidth =
      Math.min(
        Math.round(width * 1.4),
        2000
      );
  } else {
    targetWidth = 2000;
  }

  console.log(
    `🛠️ Enhanced OCR width: ${targetWidth}px`
  );

  return sharp(buffer, {
    failOn: "none",
  })
    .rotate()
    .resize({
      width: targetWidth,
      withoutEnlargement: false,
      fit: "inside",
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.3,
    })
    .png({
      compressionLevel: 6,
    })
    .toBuffer();
}

// =====================================================
// BUFFER -> ARRAYBUFFER
//
// PaddleOCR receives a clean exact ArrayBuffer,
// not Node's larger backing buffer.
// =====================================================

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset +
      buffer.byteLength
  );
}

// =====================================================
// RUN PADDLE OCR
// =====================================================

async function runRecognition(
  service,
  buffer,
  label
) {
  const startedAt =
    Date.now();

  console.log(
    `🔍 PaddleOCR scanning: ${label}`
  );

  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      `${label}: OCR input is not a Buffer`
    );
  }

  if (!buffer.length) {
    throw new Error(
      `${label}: OCR buffer is empty`
    );
  }

  console.log(
    `📦 OCR buffer: ${(buffer.length / 1024).toFixed(1)} KB`
  );

  const arrayBuffer =
    bufferToArrayBuffer(buffer);

  const result =
    await service.recognize(
      arrayBuffer,
      {
        flatten: true,

        // Better speed than doing recognition box-by-box.
        strategy: "per-line",

        minimumConfidence: 0.35,

        noCache: true,
      }
    );

  const text =
    collectText(result);

  const duration =
    Date.now() -
    startedAt;

  console.log(
    `🔍 PaddleOCR ${label}: ${duration}ms`
  );

  console.log(
    `========== ${label.toUpperCase()} ==========`
  );

  console.log(
    text || "[NO OCR TEXT]"
  );

  console.log(
    "=========================================="
  );

  return {
    result,
    text,
    duration,
  };
}

// =====================================================
// SCAN PRODUCT IMAGE
//
// PASS 1:
// Normal image
//
// PASS 2:
// Enhanced image ONLY if pass 1 fails
//
// Existing external interface remains:
// scanProductImage(imageUrl)
// =====================================================

async function scanProductImage(
  imageUrl
) {
  const startedAt =
    Date.now();

  let rawText = "";

  try {
    // Initialize model and download simultaneously.
    const [
      service,
      downloadedBuffer,
    ] = await Promise.all([
      getPaddleService(),
      downloadImage(imageUrl),
    ]);

    // =================================================
    // PASS 1
    // =================================================

    const originalBuffer =
      await prepareOriginalImage(
        downloadedBuffer
      );

    const first =
      await runRecognition(
        service,
        originalBuffer,
        "paddle-original"
      );

    if (first.text) {
      rawText += first.text;
    }

    let ttCode =
      extractTTCode(
        first.text
      );

    // Immediately stop when a reliable TT code is found.
    if (ttCode) {
      const duration =
        Date.now() -
        startedAt;

      console.log(
        `🏷️ TT detected: ${ttCode}`
      );

      console.log(
        `⚡ Total OCR time: ${duration}ms`
      );

      return {
        success: true,
        ttCode,
        rawText,
        duration,
      };
    }

    // =================================================
    // PASS 2
    //
    // Run only when first pass failed.
    // =================================================

    console.log(
      "🛠️ TT not found; running enhanced fallback..."
    );

    const enhancedBuffer =
      await buildEnhancedImage(
        downloadedBuffer
      );

    const second =
      await runRecognition(
        service,
        enhancedBuffer,
        "paddle-enhanced"
      );

    if (second.text) {
      rawText +=
        `${rawText ? "\n" : ""}${second.text}`;
    }

    ttCode =
      extractTTCode(
        second.text
      );

    if (ttCode) {
      const duration =
        Date.now() -
        startedAt;

      console.log(
        `🏷️ TT detected after enhancement: ${ttCode}`
      );

      console.log(
        `⚡ Total OCR time: ${duration}ms`
      );

      return {
        success: true,
        ttCode,
        rawText,
        duration,
      };
    }

    // =================================================
    // COMBINED SAFE CHECK
    // =================================================

    ttCode =
      extractTTCode(
        rawText
      );

    if (ttCode) {
      const duration =
        Date.now() -
        startedAt;

      console.log(
        `🏷️ TT detected from combined OCR: ${ttCode}`
      );

      console.log(
        `⚡ Total OCR time: ${duration}ms`
      );

      return {
        success: true,
        ttCode,
        rawText,
        duration,
      };
    }

    // =================================================
    // FAILED
    // =================================================

    const duration =
      Date.now() -
      startedAt;

    console.log(
      "❌ TT Code not detected"
    );

    console.log(
      `⏱️ OCR failed after ${duration}ms`
    );

    return {
      success: false,
      ttCode: null,
      rawText,
      duration,
    };
  } catch (error) {
    const duration =
      Date.now() -
      startedAt;

    console.error(
      "❌ PaddleOCR error:",
      error.message
    );

    if (
      process.env.OCR_DEBUG ===
      "true"
    ) {
      console.error(
        error.stack
      );
    }

    return {
      success: false,
      ttCode: null,
      rawText,
      duration,
      error:
        error.message,
    };
  }
}

// =====================================================
// SHUTDOWN
// =====================================================

async function shutdownOCR() {
  if (paddleService) {
    try {
      if (
        typeof paddleService.destroy ===
        "function"
      ) {
        await paddleService.destroy();
      }

      console.log(
        "🛑 PaddleOCR stopped"
      );
    } catch (error) {
      console.log(
        "⚠️ PaddleOCR shutdown warning:",
        error.message
      );
    }
  }

  paddleService = null;
  paddleServicePromise = null;
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  scanProductImage,
  shutdownOCR,
};