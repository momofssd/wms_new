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

// Price Condition Endpoints
router.get("/price-conditions", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    const conditions = await priceCol
      .find({})
      .sort({ sku: 1, service: 1, from_date: 1 })
      .toArray();
    res.json(conditions);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/price-conditions", async (req, res) => {
  const { sku, service, from_date, to_date, price } = req.body;
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    const sku_n = sku.trim().toUpperCase();
    const service_n = service.trim().toUpperCase(); // FBA or FBM
    const fDate = new Date(from_date);
    const tDate = new Date(to_date);
    const p = parseFloat(price);
    const now = new Date();

    if (isNaN(fDate.getTime()) || isNaN(tDate.getTime()) || isNaN(p)) {
      return res.status(400).json({ message: "Invalid input data" });
    }

    // Logic for overlapping date range:
    // "if the user enter date range overlap... the 1st valid price condition should be rewrited the end date to 02/27/2026"
    // Example:
    // 1st: 2/31/2025 (likely 2/28 or 3/1) to 03/23/2026 @ $1.50
    // 2nd (new): 02/28/2026 to 03/24/2026 @ $2.00
    // Result: 1st end date becomes 02/27/2026.

    // We look for existing conditions for same SKU and Service that overlap with the new from_date.
    // Specifically, if an existing condition's range [start, end] contains the new start date,
    // or if the existing condition starts after the new start date but before the new end date.

    // Based on the requirement: "the 1st valid price condition should be rewrited the end date to (new from_date - 1 day)"

    // Find conditions that overlap:
    // Existing condition (E) overlaps with New condition (N) if:
    // E.from_date <= N.to_date AND E.to_date >= N.from_date

    const overlapping = await priceCol
      .find({
        sku: sku_n,
        service: service_n,
        from_date: { $lte: tDate },
        to_date: { $gte: fDate },
      })
      .toArray();

    for (const doc of overlapping) {
      const eFrom = new Date(doc.from_date);
      const eTo = new Date(doc.to_date);

      if (eFrom < fDate) {
        // Case where existing condition starts before new condition.
        // We truncate the existing one's end date.
        const newEndDateForExisting = new Date(fDate);
        newEndDateForExisting.setDate(newEndDateForExisting.getDate() - 1);

        await priceCol.updateOne(
          { _id: doc._id },
          { $set: { to_date: newEndDateForExisting, updated_at: now } },
        );
      } else if (eFrom >= fDate && eTo <= tDate) {
        // Case where existing condition is completely covered by new condition.
        // Option A: Delete it. Option B: Truncate it.
        // The requirement says "rewrite the end date", but if the whole range is covered,
        // maybe it should be removed or start date moved.
        // Given the specific example, let's stick to the spirit of "new one takes precedence".
        await priceCol.deleteOne({ _id: doc._id });
      } else if (eFrom >= fDate && eFrom <= tDate && eTo > tDate) {
        // Case where existing condition starts during new condition but ends after.
        // Truncate the existing one's start date to be after new condition's end date.
        const newStartDateForExisting = new Date(tDate);
        newStartDateForExisting.setDate(newStartDateForExisting.getDate() + 1);
        await priceCol.updateOne(
          { _id: doc._id },
          { $set: { from_date: newStartDateForExisting, updated_at: now } },
        );
      }
    }

    await priceCol.insertOne({
      sku: sku_n,
      service: service_n,
      from_date: fDate,
      to_date: tDate,
      price: p,
      created_at: now,
      updated_at: now,
    });

    res.json({ success: true, message: `Saved price condition for ${sku_n}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/price-conditions/:id", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    await priceCol.deleteOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
    });
    res.json({ success: true, message: "Price condition deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
