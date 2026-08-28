const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email || !password) {
    console.warn("⚠️ ADMIN_EMAIL or ADMIN_PASSWORD is missing in .env");
    return;
  }

  let admin = await Admin.findOne({ email });

  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 12);

    admin = await Admin.create({
      email,
      passwordHash,
      role: "ADMIN",
    });

    console.log(`✅ Admin created: ${email}`);
    return;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    admin.passwordHash,
  );

  if (!passwordMatches) {
    admin.passwordHash = await bcrypt.hash(password, 12);
    await admin.save();

    console.log(`✅ Admin password updated: ${email}`);
    return;
  }

  console.log(`✅ Admin ready: ${email}`);
}

module.exports = { ensureAdmin };