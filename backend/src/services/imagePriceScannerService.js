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
// NORMALIZE OCR DIGITS
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

// =====================================================
// TT CODE EXTRACTION
//
// VALID:
// TT13259
// TT13258
// TT12868
// TT13174
//
// Rule:
// TT + exactly 5 digits
//
// OCR confusion supported:
// TT13174 -> 1113174
// TT13174 -> 1713174
// =====================================================

function extractTTCode(text = "") {
  if (!text) {
    return null;
  }

  const normalized = String(text)
    .toUpperCase()
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  // ---------------------------------------------------
  // 1. NORMAL TT + EXACTLY 5 DIGITS
  //
  // TT13174
  // TT 13174
  // TT-13174
  // TT:13174
  // ---------------------------------------------------

  let match = normalized.match(
    /\bTT\s*[-:]?\s*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `✅ Normal TT detected: ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 2. DESIGN CODE
  //
  // Design Code: TT13174
  // ---------------------------------------------------

  match = normalized.match(
    /DESIGN\s*CODE\s*[:=\-]?\s*TT\s*[-:]?\s*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `✅ Design Code detected: ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 3. SEPARATED T T
  //
  // T T 13174
  // T-T-13174
  // T.T.13174
  // ---------------------------------------------------

  match = normalized.match(
    /\bT[\s._|:-]+T[\s._|:-]*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `✅ Separated TT detected: ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 4. OCR CONFUSION
  //
  // TT may become 11
  //
  // Actual:
  // TT13174
  //
  // OCR:
  // 1113174
  // ---------------------------------------------------

  match = normalized.match(
    /\b11(\d{5})\b/
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `⚠️ OCR corrected 11${match[1]} -> ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 5. OCR CONFUSION
  //
  // TT may become 17
  //
  // Actual:
  // TT13174
  //
  // OCR:
  // 1713174
  // ---------------------------------------------------

  match = normalized.match(
    /\b17(\d{5})\b/
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `⚠️ OCR corrected 17${match[1]} -> ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 6. OCR NOISE BEFORE 11
  //
  // Example:
  // 17113174
  //
  // Find final:
  // 11 + 13174
  //
  // Result:
  // TT13174
  // ---------------------------------------------------

  match = normalized.match(
    /(?:^|\D)\d*11(\d{5})(?:\D|$)/
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `⚠️ OCR corrected noisy 11 -> ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 7. OCR NOISE BEFORE 17
  // ---------------------------------------------------

  match = normalized.match(
    /(?:^|\D)\d*17(\d{5})(?:\D|$)/
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `⚠️ OCR corrected noisy 17 -> ${code}`
    );

    return code;
  }

  // ---------------------------------------------------
  // 8. TT + OCR CONFUSED DIGITS
  //
  // Example:
  // TTI3I74
  //
  // I -> 1
  // L -> 1
  // O -> 0
  // Q -> 0
  // S -> 5
  // B -> 8
  // Z -> 2
  // G -> 6
  // ---------------------------------------------------

  match = normalized.match(
    /\bTT\s*[-:]?\s*([0-9ILOQSBZG]{5})\b/i
  );

  if (match) {
    const digits =
      normalizeOCRDigits(
        match[1]
      );

    if (/^\d{5}$/.test(digits)) {
      const code =
        `TT${digits}`;

      console.log(
        `⚠️ OCR digit correction -> ${code}`
      );

      return code;
    }
  }

  return null;
}

// =====================================================
// GET IMAGE DIMENSIONS
// =====================================================

async function getDimensions(buffer) {
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

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

// =====================================================
// CREATE OCR CROP
// =====================================================

async function createCrop(
  buffer,
  type
) {
  const {
    width,
    height,
  } = await getDimensions(
    buffer
  );

  let left;
  let top;
  let cropWidth;
  let cropHeight;
  let scale;
  let threshold = false;
  let invert = false;

  // ===================================================
  // 1. EXTREME BOTTOM-RIGHT
  //
  // Primary TT label location.
  //
  // Small crop = less dress/background noise.
  // ===================================================

  if (type === "tight") {
    left = Math.floor(
      width * 0.68
    );

    top = Math.floor(
      height * 0.78
    );

    cropWidth =
      width - left;

    cropHeight =
      height - top;

    scale = 7;
  }

  // ===================================================
  // 2. LARGER BOTTOM-RIGHT
  // ===================================================

  else if (type === "large") {
    left = Math.floor(
      width * 0.50
    );

    top = Math.floor(
      height * 0.65
    );

    cropWidth =
      width - left;

    cropHeight =
      height - top;

    scale = 5;
  }

  // ===================================================
  // 3. EXTREME BOTTOM-RIGHT THRESHOLD
  // ===================================================

  else if (
    type === "tight-threshold"
  ) {
    left = Math.floor(
      width * 0.68
    );

    top = Math.floor(
      height * 0.78
    );

    cropWidth =
      width - left;

    cropHeight =
      height - top;

    scale = 7;

    threshold = true;
  }

  // ===================================================
  // 4. EXTREME BOTTOM-RIGHT INVERT
  // ===================================================

  else if (
    type === "tight-invert"
  ) {
    left = Math.floor(
      width * 0.68
    );

    top = Math.floor(
      height * 0.78
    );

    cropWidth =
      width - left;

    cropHeight =
      height - top;

    scale = 7;

    threshold = true;
    invert = true;
  }

  // ===================================================
  // 5. FULL BOTTOM AREA
  // ===================================================

  else if (
    type === "bottom-threshold"
  ) {
    left = 0;

    top = Math.floor(
      height * 0.65
    );

    cropWidth = width;

    cropHeight =
      height - top;

    scale = 3;

    threshold = true;
  }

  else {
    throw new Error(
      `Unknown crop type: ${type}`
    );
  }

  cropWidth = Math.max(
    1,
    cropWidth
  );

  cropHeight = Math.max(
    1,
    cropHeight
  );

  let pipeline = sharp(buffer)
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .resize({
      width: Math.min(
        cropWidth * scale,
        3500
      ),
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.4,
    });

  if (threshold) {
    pipeline =
      pipeline.threshold(165);
  }

  if (invert) {
    pipeline =
      pipeline.negate();
  }

  return pipeline
    .png()
    .toBuffer();
}

// =====================================================
// FULL IMAGE FALLBACK
// =====================================================

async function createFullImage(
  buffer
) {
  const {
    width,
  } = await getDimensions(
    buffer
  );

  return sharp(buffer)
    .resize({
      width: Math.min(
        Math.max(
          width,
          1500
        ),
        2400
      ),
      withoutEnlargement: false,
      fit: "inside",
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.2,
    })
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
// FAST FLOW:
//
// 1. Extreme bottom-right
// 2. Larger bottom-right
// 3. Tight threshold
// 4. Tight inverted threshold
// 5. Bottom threshold
// 6. Full image
//
// IMPORTANT:
// As soon as TT is detected,
// remaining OCR attempts stop.
// =====================================================

async function scanProductImage(
  imageUrl
) {
  const startedAt =
    Date.now();

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

    const attempts = [
      {
        name:
          "tight-bottom-right",

        build: () =>
          createCrop(
            originalBuffer,
            "tight"
          ),
      },

      {
        name:
          "large-bottom-right",

        build: () =>
          createCrop(
            originalBuffer,
            "large"
          ),
      },

      {
        name:
          "tight-threshold",

        build: () =>
          createCrop(
            originalBuffer,
            "tight-threshold"
          ),
      },

      {
        name:
          "tight-invert",

        build: () =>
          createCrop(
            originalBuffer,
            "tight-invert"
          ),
      },

      {
        name:
          "bottom-threshold",

        build: () =>
          createCrop(
            originalBuffer,
            "bottom-threshold"
          ),
      },

      {
        name: "full",

        build: () =>
          createFullImage(
            originalBuffer
          ),
      },
    ];

    // =================================================
    // OCR ATTEMPTS
    // =================================================

    for (
      const attempt of attempts
    ) {
      try {
        const target =
          await attempt.build();

        const text =
          await recognizeImage(
            ocrWorker,
            target,
            attempt.name
          );

        allText +=
          `\n${text}`;

        const ttCode =
          extractTTCode(
            text
          );

        if (ttCode) {
          const duration =
            Date.now() -
            startedAt;

          console.log(
            `🏷️ TT detected: ${ttCode}`
          );

          console.log(
            `⚡ OCR time: ${duration}ms`
          );

          return {
            success: true,
            ttCode,
            rawText:
              allText,
            duration,
          };
        }
      } catch (error) {
        console.log(
          `⚠️ ${attempt.name} OCR failed:`,
          error.message
        );
      }
    }

    // =================================================
    // COMBINED OCR TEXT CHECK
    // =================================================

    const finalTTCode =
      extractTTCode(
        allText
      );

    if (finalTTCode) {
      const duration =
        Date.now() -
        startedAt;

      console.log(
        `🏷️ TT detected from combined OCR: ${finalTTCode}`
      );

      console.log(
        `⚡ OCR time: ${duration}ms`
      );

      return {
        success: true,
        ttCode:
          finalTTCode,
        rawText:
          allText,
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
      rawText:
        allText,
      duration,
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
      error:
        error.message,
    };
  }
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  scanProductImage,
};