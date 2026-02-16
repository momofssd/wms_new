const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.get("/", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const movementCol = db.collection("movement");
    const mmCol = db.collection("MM");

    // Fetch movements, sorted by timestamp descending by default
    const mvList = await movementCol.find({}).sort({ timestamp: -1 }).toArray();

    // Get active SKUs
    const activeSkusDocs = await mmCol
      .find({}, { projection: { sku: 1, active: 1, _id: 0 } })
      .toArray();
    const activeSkus = new Set(
      activeSkusDocs
        .filter((doc) => doc.active !== false)
        .map((doc) => String(doc.sku).trim().toUpperCase()),
    );

    // Filter movements to only include those with active SKUs in their details
    const filteredMvList = mvList.filter((mv) => {
      const details = mv.details || [];
      if (Array.isArray(details) && details.length > 0) {
        return details.some((detail) => {
          const sku = String(detail.sku || "")
            .trim()
            .toUpperCase();
          return activeSkus.has(sku);
        });
      }
      return true;
    });

    res.json(filteredMvList);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:txnNum", async (req, res) => {
  const { txnNum } = req.params;
  try {
    const db = mongoose.connection.db;
    const movementCol = db.collection("movement");
    const transactionsCol = db.collection("transactions");
    const inventoryCol = db.collection("inventory");

    const movement = await movementCol.findOne({ transaction_num: txnNum });
    if (!movement) {
      return res.status(404).json({ message: `Movement ${txnNum} not found.` });
    }

    const movementType = String(movement.movement_type || "")
      .trim()
      .toLowerCase();
    const details = movement.details || [];

    for (const detail of details) {
      const sku = String(detail.sku || "")
        .trim()
        .toUpperCase();
      const location = String(detail.location || "")
        .trim()
        .toUpperCase();

      if (movementType === "inbound") {
        const qty = parseInt(detail.inbound_qty || 0);
        if (qty > 0) {
          await inventoryCol.updateOne(
            { sku, location },
            { $inc: { quantity: -qty } },
          );
        }
      } else if (movementType === "outbound") {
        const qty = parseInt(detail.outbound_qty || 0);
        if (qty > 0) {
          await inventoryCol.updateOne(
            { sku, location },
            { $inc: { quantity: qty } },
            { upsert: true },
          );
        }
      } else if (movementType === "void") {
        const qty = parseInt(detail.void_qty || 0);
        if (qty > 0) {
          await inventoryCol.updateOne(
            { sku, location },
            { $inc: { quantity: qty } },
            { upsert: true },
          );
        }
      } else if (movementType === "sto") {
        const qty = parseInt(detail.qty || 0);
        const locFrom = String(detail.location_from || "")
          .trim()
          .toUpperCase();
        const locTo = String(detail.location_to || "")
          .trim()
          .toUpperCase();
        if (qty > 0 && locFrom && locTo) {
          await inventoryCol.updateOne(
            { sku, location: locTo },
            { $inc: { quantity: -qty } },
          );
          await inventoryCol.updateOne(
            { sku, location: locFrom },
            { $inc: { quantity: qty } },
            { upsert: true },
          );
        }
      }
    }

    await transactionsCol.deleteMany({ movement_transaction_num: txnNum });
    await movementCol.deleteOne({ transaction_num: txnNum });

    res.json({
      success: true,
      message: `Movement ${txnNum} deleted successfully.`,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: `Error deleting movement: ${err.message}` });
  }
});

module.exports = router;
