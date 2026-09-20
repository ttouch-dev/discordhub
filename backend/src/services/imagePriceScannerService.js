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

      // Focus OCR more on sparse/small text.
      try {
        await newWorker.setParameters({
          tessedit_pageseg_mode: "11",
        });
      } catch (error) {
        console.log(
          "⚠️ Could not set OCR parameters:",
          error.message
        );
      }

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
// VALID CODE:
// TT + EXACTLY 5 DIGITS
//
// Examples:
// TT13259
// TT13258
// TT12868
// TT13174
//
// Handles OCR problems:
//
// TT13174  -> normal
// 1113174  -> TT13174
// 1713174  -> TT13174
// TT712868 -> TT12868
// TTI2868  -> TT12868
// =====================================================

function extractTTCode(text = "") {
  if (!text) return null;

  const normalized = String(text)
    .toUpperCase()
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  // ===================================================
  // 1. NORMAL TT + EXACTLY 5 DIGITS
  // ===================================================

  let match = normalized.match(
    /\bTT\s*[-:]?\s*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(`✅ Normal TT detected: ${code}`);

    return code;
  }

  // ===================================================
  // 2. DESIGN CODE
  // ===================================================

  match = normalized.match(
    /DESIGN\s*CODE\s*[:=\-]?\s*TT\s*[-:]?\s*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(`✅ Design Code detected: ${code}`);

    return code;
  }

  // ===================================================
  // 3. SEPARATED TT
  //
  // T T 12868
  // T-T-12868
  // T.T.12868
  // ===================================================

  match = normalized.match(
    /\bT[\s._|:-]+T[\s._|:-]*(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(`✅ Separated TT detected: ${code}`);

    return code;
  }

  // ===================================================
  // 4. TT + ONE EXTRA OCR DIGIT
  //
  // Actual:
  // TT12868
  //
  // OCR:
  // TT712868
  //
  // Remove the accidental first digit after TT.
  // ===================================================

  match = normalized.match(
    /\bTT\s*[-:]?\s*\d(\d{5})\b/i
  );

  if (match) {
    const code = `TT${match[1]}`;

    console.log(
      `⚠️ OCR extra digit removed -> ${code}`
    );

    return code;
  }

  // ===================================================
  // 5. TT READ AS 11
  //
  // 1113174 -> TT13174
  // ===================================================

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

  // ===================================================
  // 6. TT READ AS 17
  //
  // 1713174 -> TT13174
  // ===================================================

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

  // ===================================================
  // 7. NOISY 11
  //
  // Example:
  // 17113174
  //
  // Find:
  // 11 + 13174
  // ===================================================

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

  // ===================================================
  // 8. NOISY 17
  // ===================================================

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

  // ===================================================
  // 9. OCR CONFUSED DIGITS AFTER TT
  //
  // I/L -> 1
  // O/Q -> 0
  // S   -> 5
  // B   -> 8
  // Z   -> 2
  // G   -> 6
  //
  // Example:
  // TTI2868 -> TT12868
  // ===================================================

  match = normalized.match(
    /\bTT\s*[-:]?\s*([0-9ILOQSBZG]{5})\b/i
  );

  if (match) {
    const digits = normalizeOCRDigits(match[1]);

    if (/^\d{5}$/.test(digits)) {
      const code = `TT${digits}`;

      console.log(
        `⚠️ OCR digit correction -> ${code}`
      );

      return code;
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
// SAFE CROP
// =====================================================

function clampCrop(
  width,
  height,
  left,
  top,
  cropWidth,
  cropHeight
) {
  left = Math.max(
    0,
    Math.min(left, width - 1)
  );

  top = Math.max(
    0,
    Math.min(top, height - 1)
  );

  cropWidth = Math.max(
    1,
    Math.min(cropWidth, width - left)
  );

  cropHeight = Math.max(
    1,
    Math.min(cropHeight, height - top)
  );

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  };
}

// =====================================================
// CREATE OCR CROP
// =====================================================

async function createCrop(buffer, type) {
  const {
    width,
    height,
  } = await getDimensions(buffer);

  let left;
  let top;
  let cropWidth;
  let cropHeight;

  let scale = 1;
  let threshold = false;
  let invert = false;

  // ===================================================
  // 1. LABEL TEXT
  //
  // Highest priority.
  //
  // Focus mainly on the TT text under barcode.
  // Avoid most of the dress/background.
  // ===================================================

  if (type === "label-text") {
    left = Math.floor(width * 0.62);
    top = Math.floor(height * 0.84);

    cropWidth = Math.floor(width * 0.37);
    cropHeight = Math.floor(height * 0.15);

    scale = 10;
  }

  // ===================================================
  // 2. LABEL TEXT THRESHOLD
  // ===================================================

  else if (type === "label-text-threshold") {
    left = Math.floor(width * 0.62);
    top = Math.floor(height * 0.84);

    cropWidth = Math.floor(width * 0.37);
    cropHeight = Math.floor(height * 0.15);

    scale = 10;
    threshold = true;
  }

  // ===================================================
  // 3. BARCODE + TT LABEL
  //
  // Slightly larger area.
  // ===================================================

  else if (type === "tight") {
    left = Math.floor(width * 0.60);
    top = Math.floor(height * 0.74);

    cropWidth = Math.floor(width * 0.39);
    cropHeight = Math.floor(height * 0.25);

    scale = 8;
  }

  // ===================================================
  // 4. BARCODE + LABEL THRESHOLD
  // ===================================================

  else if (type === "tight-threshold") {
    left = Math.floor(width * 0.60);
    top = Math.floor(height * 0.74);

    cropWidth = Math.floor(width * 0.39);
    cropHeight = Math.floor(height * 0.25);

    scale = 8;
    threshold = true;
  }

  // ===================================================
  // 5. BARCODE + LABEL INVERT
  // ===================================================

  else if (type === "tight-invert") {
    left = Math.floor(width * 0.60);
    top = Math.floor(height * 0.74);

    cropWidth = Math.floor(width * 0.39);
    cropHeight = Math.floor(height * 0.25);

    scale = 8;
    threshold = true;
    invert = true;
  }

  // ===================================================
  // 6. LARGER LOWER-RIGHT
  // ===================================================

  else if (type === "large") {
    left = Math.floor(width * 0.45);
    top = Math.floor(height * 0.60);

    cropWidth = width - left;
    cropHeight = height - top;

    scale = 5;
  }

  // ===================================================
  // 7. BOTTOM AREA
  // ===================================================

  else if (type === "bottom-threshold") {
    left = 0;
    top = Math.floor(height * 0.60);

    cropWidth = width;
    cropHeight = height - top;

    scale = 3;
    threshold = true;
  }

  else {
    throw new Error(
      `Unknown crop type: ${type}`
    );
  }

  const crop = clampCrop(
    width,
    height,
    left,
    top,
    cropWidth,
    cropHeight
  );

  let pipeline = sharp(buffer)
    .extract(crop)
    .resize({
      width: Math.min(
        crop.width * scale,
        3500
      ),
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.5,
    });

  if (threshold) {
    pipeline = pipeline.threshold(165);
  }

  if (invert) {
    pipeline = pipeline.negate();
  }

  return pipeline
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
        Math.max(width, 1600),
        2600
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
// OCR
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
    await ocrWorker.recognize(buffer);

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
// ORDER:
//
// 1. Label text
// 2. Label text threshold
// 3. Barcode + label
// 4. Barcode + label threshold
// 5. Barcode + label invert
// 6. Larger lower-right
// 7. Bottom threshold
// 8. Full image
//
// Stops immediately when TT is detected.
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
      await downloadImage(imageUrl);

    let allText = "";

    const attempts = [
      {
        name: "label-text",
        build: () =>
          createCrop(
            originalBuffer,
            "label-text"
          ),
      },

      {
        name: "label-text-threshold",
        build: () =>
          createCrop(
            originalBuffer,
            "label-text-threshold"
          ),
      },

      {
        name: "barcode-label",
        build: () =>
          createCrop(
            originalBuffer,
            "tight"
          ),
      },

      {
        name: "barcode-label-threshold",
        build: () =>
          createCrop(
            originalBuffer,
            "tight-threshold"
          ),
      },

      {
        name: "barcode-label-invert",
        build: () =>
          createCrop(
            originalBuffer,
            "tight-invert"
          ),
      },

      {
        name: "large-bottom-right",
        build: () =>
          createCrop(
            originalBuffer,
            "large"
          ),
      },

      {
        name: "bottom-threshold",
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

    for (const attempt of attempts) {
      try {
        const target =
          await attempt.build();

        const text =
          await recognizeImage(
            ocrWorker,
            target,
            attempt.name
          );

        allText += `\n${text}`;

        const ttCode =
          extractTTCode(text);

        if (ttCode) {
          const duration =
            Date.now() - startedAt;

          console.log(
            `🏷️ TT detected: ${ttCode}`
          );

          console.log(
            `⚡ OCR time: ${duration}ms`
          );

          return {
            success: true,
            ttCode,
            rawText: allText,
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
    // FINAL COMBINED CHECK
    // =================================================

    const finalTTCode =
      extractTTCode(allText);

    if (finalTTCode) {
      const duration =
        Date.now() - startedAt;

      console.log(
        `🏷️ TT detected from combined OCR: ${finalTTCode}`
      );

      console.log(
        `⚡ OCR time: ${duration}ms`
      );

      return {
        success: true,
        ttCode: finalTTCode,
        rawText: allText,
        duration,
      };
    }

    // =================================================
    // FAILED
    // =================================================

    const duration =
      Date.now() - startedAt;

    console.log(
      "❌ TT Code not detected"
    );

    console.log(
      `⏱️ OCR failed after ${duration}ms`
    );

    return {
      success: false,
      ttCode: null,
      rawText: allText,
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