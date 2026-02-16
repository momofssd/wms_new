const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const pdfParse = require("pdf-parse-fork");
const {
  getNextOutboundTransactionNum,
  buildMovementDoc,
} = require("../utils/movement");
const { extractTrackingNumbersFromText } = require("../utils/tracking");

const upload = multer({ storage: multer.memoryStorage() });

// Get active locations
router.get("/locations", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const locs = await inventoryCol.distinct("location");
    res.json(locs.sort());
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/validate-scan", async (req, res) => {
  const { sku, location } = req.body;
  try {
    const db = mongoose.connection.db;
    const mmCol = db.collection("MM");
    const inventoryCol = db.collection("inventory");

    const mmDoc = await mmCol.findOne({ sku: sku.trim().toUpperCase() });
    if (!mmDoc) {
      return res
        .status(400)
        .json({ message: `SKU ${sku} not found in Material Master` });
    }
    if (mmDoc.active === false) {
      return res.status(400).json({ message: `SKU ${sku} is deactivated` });
    }

    const invDoc = await inventoryCol.findOne({
      sku: sku.trim().toUpperCase(),
      location: location.trim().toUpperCase(),
    });

    if (!invDoc || (invDoc.quantity || 0) <= 0) {
      return res
        .status(400)
        .json({ message: `SKU ${sku} out of stock at ${location}` });
    }

    res.json({
      success: true,
      product_name: String(
        invDoc.product_name || mmDoc.product_name || mmDoc.name || "",
      )
        .trim()
        .toUpperCase(),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/process-pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    // In a real warehouse environment, you'd want to parse page by page
    // pdf-parse provides the full text, but we can try to find tracking numbers in it
    const trackingNumbers = extractTrackingNumbersFromText(text);

    if (trackingNumbers.length === 0) {
      return res
        .status(400)
        .json({ message: "No USPS tracking numbers found in PDF" });
    }

    res.json({ trackingNumbers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error parsing PDF" });
  }
});

router.post("/confirm-session", async (req, res) => {
  const { pending } = req.body;
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const movementCol = db.collection("movement");

    if (!pending || pending.length === 0) {
      return res.status(400).json({ message: "No items to confirm" });
    }

    for (const item of pending) {
      const qtyToDeduct = parseInt(item.outbound_qty || 1);
      const result = await inventoryCol.updateOne(
        {
          sku: item.sku.trim().toUpperCase(),
          location: item.location.trim().toUpperCase(),
          quantity: { $gte: qtyToDeduct },
        },
        { $inc: { quantity: -qtyToDeduct } },
      );

      if (result.modifiedCount === 0) {
        return res.status(400).json({
          message: `Confirm failed: ${item.sku} insufficient stock at ${item.location}`,
        });
      }
    }

    const txnNum = await getNextOutboundTransactionNum();
    const shipFromLoc = String(pending[0].location).trim().toUpperCase();
    let totalQty = 0;

    const transactions = pending.map((p) => {
      const qty = parseInt(p.outbound_qty || 1);
      totalQty += qty;
      return {
        ...p,
        timestamp: new Date(p.timestamp),
        sku: p.sku.trim().toUpperCase(),
        location: p.location.trim().toUpperCase(),
        type: "outbound",
        outbound_qty: qty,
        movement_transaction_num: txnNum,
      };
    });

    await transactionsCol.insertMany(transactions);

    const mvDoc = buildMovementDoc(
      "outbound",
      txnNum,
      totalQty,
      shipFromLoc,
      transactions,
    );
    await movementCol.insertOne(mvDoc);

    res.json({
      success: true,
      message: `Confirmed session: ${totalQty} item(s) applied. Txn: ${txnNum}`,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
