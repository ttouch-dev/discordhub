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

function normalizeText(text = "") {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function downloadImage(imageUrl) {
  console.log("⬇️ Downloading Discord image...");

  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  return Buffer.from(response.data);
}

// Create several OCR targets because the TT label is normally near
// the bottom/right area of the product image.
async function createOCRImages(originalBuffer) {
  const metadata = await sharp(originalBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error("Could not read image dimensions");
  }

  console.log(`🖼️ Original image: ${width}x${height}`);

  const images = [];

  try {
    const cropWidth = Math.max(1, Math.floor(width * 0.45));
    const cropHeight = Math.max(1, Math.floor(height * 0.30));

    const bottomRight = await sharp(originalBuffer)
      .extract({
        left: Math.max(0, width - cropWidth),
        top: Math.max(0, height - cropHeight),
        width: cropWidth,
        height: cropHeight,
      })
      .resize({
        width: Math.min(cropWidth * 3, 2500),
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    images.push({ name: "bottom-right", buffer: bottomRight });
  } catch (error) {
    console.log("⚠️ Bottom-right crop failed:", error.message);
  }

  try {
    const cropHeight = Math.max(1, Math.floor(height * 0.35));

    const bottom = await sharp(originalBuffer)
      .extract({
        left: 0,
        top: Math.max(0, height - cropHeight),
        width,
        height: cropHeight,
      })
      .resize({
        width: Math.min(width * 2, 3000),
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    images.push({ name: "bottom", buffer: bottom });
  } catch (error) {
    console.log("⚠️ Bottom crop failed:", error.message);
  }

  try {
    const full = await sharp(originalBuffer)
      .resize({
        width: Math.min(Math.max(width, 1200), 2000),
        withoutEnlargement: false,
        fit: "inside",
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    images.push({ name: "full", buffer: full });
  } catch (error) {
    console.log("⚠️ Full OCR preprocessing failed:", error.message);
  }

  if (!images.length) {
    throw new Error("Could not prepare image for OCR");
  }

  return images;
}

function extractTTCode(text = "") {
  if (!text) return null;

  let normalized = normalizeText(text);

  // OCR sometimes separates T T.
  normalized = normalized.replace(
    /\bT\s+T\s*[-:]?\s*(\d{3,})\b/gi,
    "TT$1"
  );

  const patterns = [
    /design\s*code\s*[:=\-]?\s*TT\s*[-:]?\s*(\d{3,})/i,
    /\bTT\s*[-:]?\s*(\d{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return `TT${match[1]}`;
  }

  return null;
}

async function scanProductImage(imageUrl) {
  try {
    if (!imageUrl) {
      throw new Error("Image URL is required");
    }

    const ocrWorker = await getWorker();
    const originalBuffer = await downloadImage(imageUrl);
    const ocrImages = await createOCRImages(originalBuffer);

    let allText = "";

    for (const image of ocrImages) {
      console.log(`🔍 OCR scanning: ${image.name}`);

      const result = await ocrWorker.recognize(image.buffer);
      const rawText = result?.data?.text || "";

      console.log(`========== OCR ${image.name.toUpperCase()} ==========`);
      console.log(rawText);
      console.log("==========================================");

      allText += `\n${rawText}`;

      const ttCode = extractTTCode(rawText);

      if (ttCode) {
        console.log("🏷️ TT Code detected:", ttCode);

        return {
          success: true,
          ttCode,
          rawText: allText,
        };
      }
    }

    const finalTTCode = extractTTCode(allText);

    if (finalTTCode) {
      return {
        success: true,
        ttCode: finalTTCode,
        rawText: allText,
      };
    }

    console.log("❌ TT Code not detected");

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
