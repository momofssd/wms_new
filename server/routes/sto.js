const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const {
  getNextSTOTransactionNum,
  buildMovementDoc,
} = require("../utils/movement");

router.post("/submit", async (req, res) => {
  const { sku, fromLocation, toLocation, qty } = req.body;
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");
    const movementCol = db.collection("movement");

    const sku_n = String(sku).trim().toUpperCase();
    const from_loc_n = String(fromLocation).trim().toUpperCase();
    const to_loc_n = String(toLocation).trim().toUpperCase();
    const qty_n = parseInt(qty);

    // 1. Validate SKU
    const mmDoc = await mmCol.findOne({ sku: sku_n });
    if (!mmDoc) {
      return res
        .status(400)
        .json({ message: `SKU ${sku_n} not found in Material Master` });
    }
    if (mmDoc.active === false) {
      return res.status(400).json({ message: `SKU ${sku_n} is deactivated` });
    }

    const productName = String(mmDoc.product_name || mmDoc.name || "")
      .trim()
      .toUpperCase();

    // 2. Check sufficient qty at fromLocation and decrement
    const result = await inventoryCol.updateOne(
      { sku: sku_n, location: from_loc_n, quantity: { $gte: qty_n } },
      { $inc: { quantity: -qty_n } },
    );

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .json({ message: `Insufficient stock at ${from_loc_n}` });
    }

    // 3. Increment qty at toLocation
    await inventoryCol.updateOne(
      { sku: sku_n, location: to_loc_n },
      {
        $set: { product_name: productName },
        $inc: { quantity: qty_n },
      },
      { upsert: true },
    );

    // 4. Generate Txn Num and Log
    const txnNum = await getNextSTOTransactionNum();
    const timestamp = new Date();

    const outboundTx = {
      timestamp,
      sku: sku_n,
      product_name: productName,
      shipment_id: "",
      location: from_loc_n,
      type: "outbound",
      outbound_qty: qty_n,
      reason: "STO transfer out",
      sto: true,
      location_from: from_loc_n,
      location_to: to_loc_n,
      movement_transaction_num: txnNum,
    };

    const inboundTx = {
      timestamp,
      sku: sku_n,
      product_name: productName,
      shipment_id: "",
      location: to_loc_n,
      type: "inbound",
      inbound_qty: qty_n,
      reason: "STO transfer in",
      sto: true,
      location_from: from_loc_n,
      location_to: to_loc_n,
      movement_transaction_num: txnNum,
    };

    await transactionsCol.insertMany([outboundTx, inboundTx]);

    const mvDoc = buildMovementDoc("sto", txnNum, qty_n, from_loc_n, [
      {
        timestamp,
        sku: sku_n,
        product_name: productName,
        qty: qty_n,
        location_from: from_loc_n,
        location_to: to_loc_n,
        type: "sto",
        shipment_id: "",
        movement_transaction_num: txnNum,
      },
    ]);
    mvDoc.delivery_locations = { from: from_loc_n, to: to_loc_n };

    await movementCol.insertOne(mvDoc);

    res.json({
      success: true,
      message: `STO Transaction Completed Successfully! Txn: ${txnNum}`,
      txnNum,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
