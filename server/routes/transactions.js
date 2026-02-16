const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { extractTrackingNumbersFromText } = require("../utils/tracking");

router.get("/", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");

    // Fetch all transactions, sorted by timestamp descending
    const txList = await transactionsCol
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    // Fetch active SKUs
    const activeSkusDocs = await mmCol
      .find({}, { projection: { sku: 1, active: 1, _id: 0 } })
      .toArray();

    const activeSkus = new Set(
      activeSkusDocs
        .filter((doc) => doc.active !== false)
        .map((doc) => String(doc.sku).trim().toUpperCase()),
    );

    // Filter by active SKUs
    const filteredTxList = txList.filter((tx) => {
      const sku = String(tx.sku || "")
        .trim()
        .toUpperCase();
      return activeSkus.has(sku);
    });

    res.json(filteredTxList);
  } catch (err) {
    console.error("Error in transactions API:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/extract-shipments", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const transactionsCol = db.collection("transactions");

    // We fetch only outbound transactions with shipment_id or likely tracking info
    // to minimize memory impact and handle logic server-side
    const query = {
      type: "outbound",
      $or: [
        { shipment_id: { $ne: null, $ne: "" } },
        { reason: { $regex: /9[2-5]\d{20}/ } }, // Quick regex for potential USPS
      ],
    };

    const outboundTxs = await transactionsCol
      .find(query)
      .sort({ timestamp: -1 })
      .toArray();

    const shipmentData = [];
    outboundTxs.forEach((t) => {
      const sid = String(t.shipment_id || "").trim();
      const reason = String(t.reason || "").trim();

      if (sid) {
        const extracted = extractTrackingNumbersFromText(sid);
        extracted.forEach((tracking) => {
          shipmentData.push({
            tracking,
            timestamp: t.timestamp,
          });
        });
      }
      if (reason) {
        const extracted = extractTrackingNumbersFromText(reason);
        extracted.forEach((tracking) => {
          shipmentData.push({
            tracking,
            timestamp: t.timestamp,
          });
        });
      }
    });

    // Unique by tracking
    const seen = new Set();
    const uniqueShipments = [];
    for (const item of shipmentData) {
      if (!seen.has(item.tracking)) {
        seen.add(item.tracking);
        uniqueShipments.push(item);
      }
    }

    res.json(uniqueShipments);
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({ message: "Error extracting shipments" });
  }
});

module.exports = router;
