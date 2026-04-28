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

// Admin routes for user management
router.post("/users", async (req, res) => {
  const { username, password, role } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!username || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (role !== "admin" && role !== "user") {
      return res.status(400).json({ message: "Invalid role" });
    }

    const db = mongoose.connection.db;
    const usersCol = db.collection("users");

    // Check if user already exists
    const existingUser = await usersCol.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const newUser = {
      username,
      password: hashPass(password),
      role,
      allowed_skus: [],
      default_location: "None",
      created_at: new Date(),
    };

    const result = await usersCol.insertOne(newUser);

    // Return created user without password
    const createdUser = {
      _id: result.insertedId,
      username: newUser.username,
      role: newUser.role,
      allowed_skus: newUser.allowed_skus,
      default_location: newUser.default_location,
    };

    res.status(201).json(createdUser);
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/users/:id/password", async (req, res) => {
  const { password } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const db = mongoose.connection.db;
    const usersCol = db.collection("users");

    // Check target user exists and is a regular user
    const targetUser = await usersCol.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
    });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role !== "user") {
      return res
        .status(403)
        .json({ message: "Can only change password for regular users" });
    }

    await usersCol.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { password: hashPass(password) } },
    );

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/users", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const db = mongoose.connection.db;
    const usersCol = db.collection("users");
    const users = await usersCol
      .find({ role: "user" }, { projection: { password: 0 } })
      .toArray();

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/user-skus", async (req, res) => {
  const { userId, skus } = req.body;
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const db = mongoose.connection.db;
    const usersCol = db.collection("users");

    await usersCol.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { allowed_skus: skus } },
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token" });

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role?.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const db = mongoose.connection.db;
    const usersCol = db.collection("users");

    // Prevent self-deletion
    if (decoded.id === req.params.id) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own admin account" });
    }

    await usersCol.deleteOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
    });

    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
