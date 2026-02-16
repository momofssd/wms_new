const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Helper to hash password matching the original Streamlit app (SHA-256)
const hashPass = (password) => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const db = mongoose.connection.db;
    const usersCol = db.collection("users");
    const user = await usersCol.findOne({
      username: username,
      password: hashPass(password),
    });

    if (user) {
      const token = jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );
      res.json({
        token,
        user: {
          username: user.username,
          role: user.role,
          default_location: user.default_location,
        },
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/default-location", async (req, res) => {
  const { location } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = mongoose.connection.db;
    const usersCol = db.collection("users");

    await usersCol.updateOne(
      { _id: new mongoose.Types.ObjectId(decoded.id) },
      { $set: { default_location: location } },
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
