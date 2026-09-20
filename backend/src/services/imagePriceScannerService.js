const { createWorker } = require("tesseract.js");
const axios = require("axios");
const sharp = require("sharp");

let worker = null;
let workerPromise = null;

// =====================================================
// OCR WORKER
// =====================================================

async function getWorker() {
  if (worker) return worker;

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
// TT CODE EXTRACTION
// =====================================================

function normalizeOCRDigits(value = "") {
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

function extractTTCode(text = "") {
  if (!text) return null;

  const normalized = String(text)
    .toUpperCase()
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  // 1. Correct OCR: TT + exactly 5 digits
  let match = normalized.match(
    /\bTT\s*[-:]?\s*(\d{5})\b/i
  );

  if (match) {
    return `TT${match[1]}`;
  }

  // 2. OCR confusion:
  // TT may be recognized as 11
  // Example: 1113174 -> TT13174
  match = normalized.match(
    /\b11(\d{5})\b/
  );

  if (match) {
    console.log(
      `⚠️ OCR corrected 11${match[1]} -> TT${match[1]}`
    );

    return `TT${match[1]}`;
  }

  // 3. OCR confusion:
  // TT may be recognized as 17
  // Example: 1713174 -> TT13174
  match = normalized.match(
    /\b17(\d{5})\b/
  );

  if (match) {
    console.log(
      `⚠️ OCR corrected 17${match[1]} -> TT${match[1]}`
    );

    return `TT${match[1]}`;
  }

  // 4. Handle OCR noise before TT-like prefix.
  // Example from your log:
  // 17113174
  //
  // Last 7 digits = 1113174
  // 11 -> TT
  // 13174 -> product code
  match = normalized.match(
    /(?:^|\D)\d*11(\d{5})(?:\D|$)/
  );

  if (match) {
    console.log(
      `⚠️ OCR corrected noisy 11 -> TT${match[1]}`
    );

    return `TT${match[1]}`;
  }

  // 5. Same fallback for 17
  match = normalized.match(
    /(?:^|\D)\d*17(\d{5})(?:\D|$)/
  );

  if (match) {
    console.log(
      `⚠️ OCR corrected noisy 17 -> TT${match[1]}`
    );

    return `TT${match[1]}`;
  }

  return null;
}

// =====================================================
// IMAGE HELPERS
// =====================================================

async function getDimensions(buffer) {
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

async function createCrop(buffer, type) {
  const { width, height } = await getDimensions(buffer);

  let left;
  let top;
  let cropWidth;
  let cropHeight;
  let scale;
  let threshold = false;

  if (type === "tight") {
    // Primary label area: right 50%, bottom 42%.
    left = Math.floor(width * 0.50);
    top = Math.floor(height * 0.58);
    cropWidth = width - left;
    cropHeight = height - top;
    scale = 4;
  } else if (type === "large") {
    // Wider fallback: right 65%, bottom 55%.
    left = Math.floor(width * 0.35);
    top = Math.floor(height * 0.45);
    cropWidth = width - left;
    cropHeight = height - top;
    scale = 3;
  } else if (type === "bottom-threshold") {
    // Difficult labels: full-width bottom 45% + threshold.
    left = 0;
    top = Math.floor(height * 0.55);
    cropWidth = width;
    cropHeight = height - top;
    scale = 3;
    threshold = true;
  } else {
    throw new Error(`Unknown crop type: ${type}`);
  }

  let pipeline = sharp(buffer)
    .extract({
      left,
      top,
      width: Math.max(1, cropWidth),
      height: Math.max(1, cropHeight),
    })
    .resize({
      width: Math.min(Math.max(1, cropWidth) * scale, 2800),
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.4 });

  if (threshold) {
    pipeline = pipeline.threshold(165);
  }

  return pipeline.png().toBuffer();
}

async function createFullImage(buffer) {
  const { width } = await getDimensions(buffer);

  return sharp(buffer)
    .resize({
      width: Math.min(Math.max(width, 1500), 2400),
      withoutEnlargement: false,
      fit: "inside",
    })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png()
    .toBuffer();
}

async function recognizeImage(ocrWorker, buffer, name) {
  console.log(`🔍 OCR scanning: ${name}`);

  const result = await ocrWorker.recognize(buffer);
  const text = result?.data?.text || "";

  console.log(`========== OCR ${name.toUpperCase()} ==========`);
  console.log(text);
  console.log("==========================================");

  return text;
}

// =====================================================
// SCAN PRODUCT IMAGE
//
// Progressive fallback:
// 1. Tight bottom-right
// 2. Larger lower-right
// 3. Bottom 45% with threshold
// 4. Full image
//
// Later attempts run ONLY if earlier attempts fail.
// =====================================================

async function scanProductImage(imageUrl) {
  const startedAt = Date.now();

  try {
    if (!imageUrl) {
      throw new Error("Image URL is required");
    }

    const ocrWorker = await getWorker();
    const originalBuffer = await downloadImage(imageUrl);
    let allText = "";

    const attempts = [
      {
        name: "bottom-right",
        build: () => createCrop(originalBuffer, "tight"),
      },
      {
        name: "lower-right",
        build: () => createCrop(originalBuffer, "large"),
      },
      {
        name: "bottom-threshold",
        build: () => createCrop(originalBuffer, "bottom-threshold"),
      },
      {
        name: "full",
        build: () => createFullImage(originalBuffer),
      },
    ];

    for (const attempt of attempts) {
      try {
        const target = await attempt.build();
        const text = await recognizeImage(ocrWorker, target, attempt.name);
        allText += `\n${text}`;

        const ttCode = extractTTCode(text);

        if (ttCode) {
          console.log(`🏷️ TT detected: ${ttCode}`);
          console.log(`⚡ OCR time: ${Date.now() - startedAt}ms`);

          return {
            success: true,
            ttCode,
            rawText: allText,
          };
        }
      } catch (error) {
        console.log(
          `⚠️ ${attempt.name} OCR failed:`,
          error.message
        );
      }
    }

    const finalTTCode = extractTTCode(allText);

    if (finalTTCode) {
      console.log(`🏷️ TT detected from combined OCR: ${finalTTCode}`);

      return {
        success: true,
        ttCode: finalTTCode,
        rawText: allText,
      };
    }

    console.log("❌ TT Code not detected");
    console.log(`⏱️ OCR failed after ${Date.now() - startedAt}ms`);

    return {
      success: false,
      ttCode: null,
      rawText: allText,
    };
  } catch (error) {
    console.error("❌ OCR error:", error.message);

    return {
      success: false,
      ttCode: null,
      rawText: "",
      error: error.message,
    };
  }
}

module.exports = {
  scanProductImage,
};
