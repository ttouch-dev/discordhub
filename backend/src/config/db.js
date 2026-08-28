import mongoose from "mongoose";

export async function connectDB(uri) {
  try {
    if (!uri) {
      throw new Error("MONGO_URI is missing in .env");
    }

    const mongoUri = uri.trim();

    if (
      !mongoUri.startsWith("mongodb://") &&
      !mongoUri.startsWith("mongodb+srv://")
    ) {
      throw new Error(
        "Invalid MONGO_URI. It must start with mongodb:// or mongodb+srv://",
      );
    }

    mongoose.set("strictQuery", true);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed");
    console.error("message:", error.message);
    console.error("code:", error.code);

    throw error;
  }
}