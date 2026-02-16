const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const {
  getNextInboundTransactionNum,
  buildMovementDoc,
} = require("../utils/movement");

router.post("/submit", async (req, res) => {
  const { items, location } = req.body; // items is an array of { sku, qty }
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");
    const movementCol = db.collection("movement");

    const txnNum = await getNextInboundTransactionNum();
    const timestamp = new Date();
    const detailsList = [];
    const transactionDocs = [];
    let totalQty = 0;

    for (const item of items) {
      const sku = String(item.sku).trim().toUpperCase();
      const qty = parseInt(item.qty);
      totalQty += qty;

      const mmDoc = await mmCol.findOne({ sku });
      if (!mmDoc) {
        return res
          .status(400)
          .json({ message: `SKU ${sku} not found in Master Data` });
      }
      if (mmDoc.active === false) {
        return res.status(400).json({ message: `SKU ${sku} is deactivated` });
      }

      const productName = String(mmDoc.product_name || mmDoc.name || "")
        .trim()
        .toUpperCase();

      // Update inventory
      await inventoryCol.updateOne(
        { sku, location: String(location).trim().toUpperCase() },
        {
          $set: { product_name: productName },
          $inc: { quantity: qty },
        },
        { upsert: true },
      );

      const txDoc = {
        timestamp,
        sku,
        product_name: productName,
        location: String(location).trim().toUpperCase(),
        type: "inbound",
        inbound_qty: qty,
        movement_transaction_num: txnNum,
      };

      transactionDocs.push(txDoc);
      detailsList.push(txDoc);
    }

    if (transactionDocs.length > 0) {
      await transactionsCol.insertMany(transactionDocs);
    }

    const mvDoc = buildMovementDoc(
      "inbound",
      txnNum,
      totalQty,
      location,
      detailsList,
    );
    await movementCol.insertOne(mvDoc);

    res.json({ success: true, message: `Inbound successful. Txn: ${txnNum}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
