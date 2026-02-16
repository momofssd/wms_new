const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Materials (MM) Endpoints
router.get("/materials", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const mmCol = db.collection("MM");
    const materials = await mmCol
      .find({})
      .sort({ active: -1, sku: 1 })
      .toArray();
    res.json(materials);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/materials", async (req, res) => {
  const { sku, product_name, active } = req.body;
  try {
    const db = mongoose.connection.db;
    const mmCol = db.collection("MM");
    const sku_n = sku.trim().toUpperCase();
    const name_n = product_name.trim().toUpperCase();
    const now = new Date();

    await mmCol.updateOne(
      { sku: sku_n },
      {
        $set: {
          sku: sku_n,
          product_name: name_n,
          active: !!active,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    res.json({ success: true, message: `Saved material: ${sku_n}` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/materials", async (req, res) => {
  const { changes } = req.body; // Array of { sku, active }
  try {
    const db = mongoose.connection.db;
    const mmCol = db.collection("MM");
    const now = new Date();

    for (const change of changes) {
      await mmCol.updateOne(
        { sku: change.sku },
        { $set: { active: !!change.active, updated_at: now } },
      );
    }
    res.json({ success: true, message: `Updated ${changes.length} materials` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Locations Endpoints
router.get("/locations", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const locationsCol = db.collection("Locations");
    const locations = await locationsCol
      .find({})
      .sort({ active: -1, location: 1 })
      .toArray();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/locations", async (req, res) => {
  const { location, active } = req.body;
  try {
    const db = mongoose.connection.db;
    const locationsCol = db.collection("Locations");
    const loc_n = location.trim().toUpperCase();
    const now = new Date();

    await locationsCol.updateOne(
      { location: loc_n },
      {
        $set: {
          location: loc_n,
          active: !!active,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    res.json({ success: true, message: `Saved location: ${loc_n}` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/locations", async (req, res) => {
  const { changes } = req.body; // Array of { location, active }
  try {
    const db = mongoose.connection.db;
    const locationsCol = db.collection("Locations");
    const now = new Date();

    for (const change of changes) {
      await locationsCol.updateOne(
        { location: change.location },
        { $set: { active: !!change.active, updated_at: now } },
      );
    }
    res.json({ success: true, message: `Updated ${changes.length} locations` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
