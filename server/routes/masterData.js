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

    // Joining price_under with MM collection using an aggregation pipeline
    // to dynamically fetch the latest 'active' status.
    const conditions = await priceCol
      .aggregate([
        {
          $lookup: {
            from: "MM",
            localField: "sku",
            foreignField: "sku",
            as: "material_info",
          },
        },
        {
          $addFields: {
            active: {
              $ifNull: [{ $arrayElemAt: ["$material_info.active", 0] }, false],
            },
            // product_name is stored in the document, but fallback to joined MM if missing for old records
            product_name: {
              $ifNull: [
                "$product_name",
                { $arrayElemAt: ["$material_info.product_name", 0] },
                "N/A",
              ],
            },
          },
        },
        { $project: { material_info: 0 } },
        { $sort: { sku: 1, service: 1, from_date: 1 } },
      ])
      .toArray();

    res.json(conditions);
  } catch (err) {
    console.error("Error fetching price conditions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/price-conditions", async (req, res) => {
  const { skus, service, from_date, to_date, price } = req.body; // Expects skus as an array
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    const mmCol = db.collection("MM");

    const service_n = service.trim().toUpperCase(); // FBA or FBM
    const fDate = new Date(from_date);
    const tDate = new Date(to_date);
    const p = parseFloat(price);
    const now = new Date();

    if (
      !skus ||
      !Array.isArray(skus) ||
      skus.length === 0 ||
      !service_n ||
      isNaN(fDate.getTime()) ||
      isNaN(tDate.getTime()) ||
      isNaN(p)
    ) {
      return res.status(400).json({ message: "Invalid input data" });
    }

    const results = [];

    for (const sku of skus) {
      const sku_n = sku.trim().toUpperCase();

      // Fetch material info to explicitly store product_name
      const material = await mmCol.findOne({ sku: sku_n });
      const isActive = material ? !!material.active : false;
      const productName = material ? material.product_name : "N/A";

      // Logic for handling overlapping date ranges within price_under
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
          const newEndDateForExisting = new Date(fDate);
          newEndDateForExisting.setDate(newEndDateForExisting.getDate() - 1);
          await priceCol.updateOne(
            { _id: doc._id },
            { $set: { to_date: newEndDateForExisting, updated_at: now } },
          );
        } else if (eFrom >= fDate && eTo <= tDate) {
          await priceCol.deleteOne({ _id: doc._id });
        } else if (eFrom >= fDate && eFrom <= tDate && eTo > tDate) {
          const newStartDateForExisting = new Date(tDate);
          newStartDateForExisting.setDate(
            newStartDateForExisting.getDate() + 1,
          );
          await priceCol.updateOne(
            { _id: doc._id },
            { $set: { from_date: newStartDateForExisting, updated_at: now } },
          );
        }
      }

      await priceCol.insertOne({
        sku: sku_n,
        product_name: productName,
        service: service_n,
        from_date: fDate,
        to_date: tDate,
        price: p,
        active: isActive,
        created_at: now,
        updated_at: now,
      });
      results.push(sku_n);
    }

    res.json({
      success: true,
      message: `Saved price conditions for ${results.length} SKUs`,
    });
  } catch (err) {
    console.error("Error creating price conditions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/price-conditions/:id", async (req, res) => {
  const { price } = req.body;
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    const p = parseFloat(price);
    if (isNaN(p)) {
      return res.status(400).json({ message: "Invalid price" });
    }
    await priceCol.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { price: p, updated_at: new Date() } },
    );
    res.json({ success: true, message: "Price updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/price-conditions/:id", async (req, res) => {
  const { sku, service, from_date, to_date } = req.body;
  try {
    const db = mongoose.connection.db;
    const priceCol = db.collection("price_under");
    const now = new Date();

    if (sku && service && from_date && to_date) {
      // Smart Delete: adjust overlapping records
      const fDate = new Date(from_date);
      const tDate = new Date(to_date);
      const service_n = service.trim().toUpperCase();
      const sku_n = sku.trim().toUpperCase();

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

        if (eFrom < fDate && eTo > tDate) {
          // Record completely contains the deletion range -> Split into two
          const firstPartTo = new Date(fDate);
          firstPartTo.setDate(firstPartTo.getDate() - 1);

          const secondPartFrom = new Date(tDate);
          secondPartFrom.setDate(secondPartFrom.getDate() + 1);

          // Update existing to be the first part
          await priceCol.updateOne(
            { _id: doc._id },
            { $set: { to_date: firstPartTo, updated_at: now } },
          );

          // Insert the second part
          await priceCol.insertOne({
            ...doc,
            _id: undefined,
            from_date: secondPartFrom,
            created_at: now,
            updated_at: now,
          });
        } else if (eFrom < fDate) {
          // Record overlaps from the left -> Shorten it
          const newEndDate = new Date(fDate);
          newEndDate.setDate(newEndDate.getDate() - 1);
          await priceCol.updateOne(
            { _id: doc._id },
            { $set: { to_date: newEndDate, updated_at: now } },
          );
        } else if (eTo > tDate) {
          // Record overlaps from the right -> Shorten it
          const newStartDate = new Date(tDate);
          newStartDate.setDate(newStartDate.getDate() + 1);
          await priceCol.updateOne(
            { _id: doc._id },
            { $set: { from_date: newStartDate, updated_at: now } },
          );
        } else {
          // Record is completely within the deletion range -> Delete it
          await priceCol.deleteOne({ _id: doc._id });
        }
      }
      res.json({ success: true, message: "Price conditions adjusted" });
    } else {
      // Simple Delete by ID
      await priceCol.deleteOne({
        _id: new mongoose.Types.ObjectId(req.params.id),
      });
      res.json({ success: true, message: "Price condition deleted" });
    }
  } catch (err) {
    console.error("Error deleting price condition:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
