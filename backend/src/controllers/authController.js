const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

function signToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), role: admin.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email: email.toLowerCase() });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  return res.json({
    token: signToken(admin),
    admin: { id: admin._id, email: admin.email, role: admin.role },
  });
};

exports.me = async (req, res) => {
  res.json({ admin: req.admin });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.admin._id);
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }
  admin.passwordHash = await bcrypt.hash(newPassword, 12);
  await admin.save();
  res.json({ message: "Password changed successfully" });
};
