const cloudinary = require("../config/cloudinary");

const ADMIN_FOLDER = "discord/admin";

function isBase64Image(value) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
    String(value || "")
  );
}

function isCloudinaryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com"
    );
  } catch {
    return false;
  }
}

async function uploadAdminProfileImage(base64Image) {
  if (!isBase64Image(base64Image)) {
    throw new Error("Invalid profile image");
  }

  const result = await cloudinary.uploader.upload(
    base64Image,
    {
      folder: ADMIN_FOLDER,
      resource_type: "image",
      overwrite: false,
      transformation: [
        {
          width: 500,
          height: 500,
          crop: "fill",
          gravity: "face",
        },
        {
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    }
  );

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function deleteCloudinaryImage(publicId) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (error) {
    // Do not break profile/user update because old image deletion failed.
    console.error(
      "Cloudinary delete warning:",
      error.message
    );
  }
}

module.exports = {
  ADMIN_FOLDER,
  isBase64Image,
  isCloudinaryUrl,
  uploadAdminProfileImage,
  deleteCloudinaryImage,
};
