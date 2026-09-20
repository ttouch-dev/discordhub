const { createWorker } = require("tesseract.js");
const axios = require("axios");
const sharp = require("sharp");

let worker = null;
let workerPromise = null;

// =====================================================
// OCR WORKER
// =====================================================

async function getWorker() {
  if (worker) {
    return worker;
  }

  if (!workerPromise) {
    workerPromise = (async () => {
      console.log("🔍 Starting OCR worker...");

      const newWorker = await createWorker("eng");

      worker = newWorker;

      console.log("✅ OCR worker ready");

      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

// =====================================================
// DOWNLOAD IMAGE
// =====================================================

async function downloadImage(url) {
  console.log("⬇️ Downloading Discord image...");

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,
  });

  return Buffer.from(response.data);
}

// =====================================================
// EXTRACT TT CODE
// =====================================================

function extractTTCode(text = "") {
  if (!text) {
    return null;
  }

  let normalized = String(text)
    .toUpperCase()
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  // Example:
  // T T 12896 -> TT12896
  normalized = normalized.replace(
    /\bT\s+T\s*[-:]?\s*(\d{3,})\b/gi,
    "TT$1"
  );

  // Example:
  // T-T-12896
  // T.T.12896
  normalized = normalized.replace(
    /\bT[\s._|-]+T[\s._|:-]*(\d{3,})\b/gi,
    "TT$1"
  );

  // ---------------------------------------------------
  // DESIGN CODE
  // Example: Design Code: TT12896
  // ---------------------------------------------------

  let match = normalized.match(
    /DESIGN\s*CODE\s*[:=\-]?\s*TT\s*[-:]?\s*(\d{3,})/i
  );

  if (match) {
    return `TT${match[1]}`;
  }

  // ---------------------------------------------------
  // NORMAL TT
  // Example:
  // TT12896
  // TT 12896
  // TT-12896
  // TT:12896
  // ---------------------------------------------------

  match = normalized.match(
    /\bTT\s*[-:]?\s*(\d{3,})\b/i
  );

  if (match) {
    return `TT${match[1]}`;
  }

  // ---------------------------------------------------
  // SEPARATED TT
  // Example: T T12896
  // ---------------------------------------------------

  match = normalized.match(
    /\bT\s*T\s*(\d{3,})\b/i
  );

  if (match) {
    return `TT${match[1]}`;
  }

  // ---------------------------------------------------
  // OCR CONFUSION
  //
  // Sometimes:
  // TTI2896
  // TTL2896
  //
  // I/L -> 1
  // ---------------------------------------------------

  match = normalized.match(
    /\bTT\s*[-:]?\s*([0-9IL]{4,})\b/i
  );

  if (match) {
    const digits = match[1]
      .replace(/I/g, "1")
      .replace(/L/g, "1");

    if (/^\d{4,}$/.test(digits)) {
      return `TT${digits}`;
    }
  }

  return null;
}

// =====================================================
// IMAGE DIMENSIONS
// =====================================================

async function getDimensions(buffer) {
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(
      "Could not read image dimensions"
    );
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

// =====================================================
// CREATE CROPPED OCR IMAGE
// =====================================================

async function createCrop(buffer, type) {
  const {
    width,
    height,
  } = await getDimensions(buffer);

  let left;
  let top;
  let scale;

  // ---------------------------------------------------
  // FAST SCAN
  // Bottom-right label area
  // ---------------------------------------------------

  if (type === "tight") {
    left = Math.floor(
      width * 0.50
    );

    top = Math.floor(
      height * 0.58
    );

    scale = 4;
  }

  // ---------------------------------------------------
  // FALLBACK
  // Larger lower-right area
  // ---------------------------------------------------

  else if (type === "large") {
    left = Math.floor(
      width * 0.35
    );

    top = Math.floor(
      height * 0.45
    );

    scale = 3;
  }

  else {
    throw new Error(
      `Unknown crop type: ${type}`
    );
  }

  const cropWidth = Math.max(
    1,
    width - left
  );

  const cropHeight = Math.max(
    1,
    height - top
  );

  return sharp(buffer)
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .resize({
      width: Math.min(
        cropWidth * scale,
        2500
      ),
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.3,
    })
    .png()
    .toBuffer();
}

// =====================================================
// FULL IMAGE FALLBACK
// =====================================================

async function createFullImage(buffer) {
  const {
    width,
  } = await getDimensions(buffer);

  return sharp(buffer)
    .resize({
      width: Math.min(
        Math.max(width, 1400),
        2200
      ),
      withoutEnlargement: false,
      fit: "inside",
    })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

// =====================================================
// OCR RECOGNITION
// =====================================================

async function recognizeImage(
  ocrWorker,
  buffer,
  name
) {
  console.log(
    `🔍 OCR scanning: ${name}`
  );

  const result =
    await ocrWorker.recognize(
      buffer
    );

  const text =
    result?.data?.text || "";

  console.log(
    `========== OCR ${name.toUpperCase()} ==========`
  );

  console.log(text);

  console.log(
    "=========================================="
  );

  return text;
}

// =====================================================
// SCAN PRODUCT IMAGE
//
// Attempt 1:
// Bottom-right
//
// Attempt 2:
// Larger lower-right
//
// Attempt 3:
// Full image
// =====================================================

async function scanProductImage(imageUrl) {
  const startedAt = Date.now();

  try {
    if (!imageUrl) {
      throw new Error(
        "Image URL is required"
      );
    }

    const ocrWorker =
      await getWorker();

    const originalBuffer =
      await downloadImage(
        imageUrl
      );

    let allText = "";

    // =================================================
    // ATTEMPT 1
    // FAST BOTTOM-RIGHT
    // =================================================

    try {
      const croppedImage =
        await createCrop(
          originalBuffer,
          "tight"
        );

      const text =
        await recognizeImage(
          ocrWorker,
          croppedImage,
          "bottom-right"
        );

      allText += `\n${text}`;

      const ttCode =
        extractTTCode(
          text
        );

      if (ttCode) {
        console.log(
          `🏷️ TT detected: ${ttCode}`
        );

        console.log(
          `⚡ OCR time: ${
            Date.now() - startedAt
          }ms`
        );

        return {
          success: true,
          ttCode,
          rawText: allText,
        };
      }
    } catch (error) {
      console.log(
        "⚠️ Bottom-right OCR failed:",
        error.message
      );
    }

    // =================================================
    // ATTEMPT 2
    // LARGE LOWER-RIGHT
    // =================================================

    try {
      const croppedImage =
        await createCrop(
          originalBuffer,
          "large"
        );

      const text =
        await recognizeImage(
          ocrWorker,
          croppedImage,
          "lower-right"
        );

      allText += `\n${text}`;

      const ttCode =
        extractTTCode(
          text
        );

      if (ttCode) {
        console.log(
          `🏷️ TT detected: ${ttCode}`
        );

        console.log(
          `⚡ OCR time: ${
            Date.now() - startedAt
          }ms`
        );

        return {
          success: true,
          ttCode,
          rawText: allText,
        };
      }
    } catch (error) {
      console.log(
        "⚠️ Lower-right OCR failed:",
        error.message
      );
    }

    // =================================================
    // ATTEMPT 3
    // FULL IMAGE FALLBACK
    // =================================================

    try {
      console.log(
        "🔄 Trying full image fallback..."
      );

      const fullImage =
        await createFullImage(
          originalBuffer
        );

      const text =
        await recognizeImage(
          ocrWorker,
          fullImage,
          "full"
        );

      allText += `\n${text}`;

      const ttCode =
        extractTTCode(
          text
        );

      if (ttCode) {
        console.log(
          `🏷️ TT detected: ${ttCode}`
        );

        console.log(
          `⚡ OCR time: ${
            Date.now() - startedAt
          }ms`
        );

        return {
          success: true,
          ttCode,
          rawText: allText,
        };
      }
    } catch (error) {
      console.log(
        "⚠️ Full image OCR failed:",
        error.message
      );
    }

    // =================================================
    // FINAL COMBINED CHECK
    // =================================================

    const finalTTCode =
      extractTTCode(
        allText
      );

    if (finalTTCode) {
      console.log(
        `🏷️ TT detected from combined OCR: ${finalTTCode}`
      );

      return {
        success: true,
        ttCode: finalTTCode,
        rawText: allText,
      };
    }

    // =================================================
    // FAILED
    // =================================================

    console.log(
      "❌ TT Code not detected"
    );

    console.log(
      `⏱️ OCR failed after ${
        Date.now() - startedAt
      }ms`
    );

    return {
      success: false,
      ttCode: null,
      rawText: allText,
    };
  } catch (error) {
    console.error(
      "❌ OCR error:",
      error.message
    );

    return {
      success: false,
      ttCode: null,
      rawText: "",
      error: error.message,
    };
  }
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  scanProductImage,
};