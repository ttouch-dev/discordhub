const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = header.slice(7);

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const admin = await Admin.findById(
      payload.sub
    ).select(
      "_id name email profileImage profileImagePublicId role"
    );

    if (!admin) {
      return res.status(401).json({
        message: "Invalid authentication",
      });
    }

    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({
      message: "Session expired or invalid",
    });
  }
}

module.exports = auth;
