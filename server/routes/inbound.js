const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const {
  getNextInboundTransactionNum,
  getNextReturnTransactionNum,
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

router.post("/return", async (req, res) => {
  const { items, location } = req.body; // items is an array of { sku, qty }
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No return items provided" });
    }
    if (!location || String(location).trim() === "") {
      return res.status(400).json({ message: "Location is required" });
    }

    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");
    const movementCol = db.collection("movement");

    const txnNum = await getNextReturnTransactionNum();
    const timestamp = new Date();
    const normalizedLocation = String(location).trim().toUpperCase();
    const detailsList = [];
    const transactionDocs = [];
    let totalQty = 0;

    for (const item of items) {
      const sku = String(item?.sku || "")
        .trim()
        .toUpperCase();
      const qty = Number(item?.qty);
      if (!sku) {
        return res.status(400).json({ message: "SKU is required" });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: `Invalid qty for SKU ${sku}` });
      }
      totalQty += qty;

      const mmDoc = await mmCol.findOne({ sku });
      // The SKU doesn't need to be maintained in master Data.
      // If it exists, use its product name, otherwise use "Return"
      const productName = mmDoc
        ? String(mmDoc.product_name || mmDoc.name || "Return")
            .trim()
            .toUpperCase()
        : "RETURN";

      // Update inventory
      await inventoryCol.updateOne(
        { sku, location: normalizedLocation },
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
        location: normalizedLocation,
        type: "return",
        qty: qty,
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
      "return",
      txnNum,
      totalQty,
      normalizedLocation,
      detailsList,
    );
    await movementCol.insertOne(mvDoc);

    res.json({ success: true, message: `Return successful. Txn: ${txnNum}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/return-convert", async (req, res) => {
  const { returnSku, targetSku, location, qty } = req.body;
  try {
    const returnSkuN = String(returnSku || "")
      .trim()
      .toUpperCase();
    const targetSkuN = String(targetSku || "")
      .trim()
      .toUpperCase();
    const locationN = String(location || "")
      .trim()
      .toUpperCase();
    const qtyN = parseInt(qty);

    if (!returnSkuN || !targetSkuN || !locationN) {
      return res
        .status(400)
        .json({ message: "Return SKU, convert SKU and location are required" });
    }
    if (returnSkuN === targetSkuN) {
      return res
        .status(400)
        .json({ message: "Return SKU and convert SKU must be different" });
    }
    if (!Number.isFinite(qtyN) || qtyN <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }

    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");
    const movementCol = db.collection("movement");

    const targetMmDoc = await mmCol.findOne({ sku: targetSkuN });
    if (!targetMmDoc) {
      return res
        .status(400)
        .json({ message: `Convert SKU ${targetSkuN} not found in Master Data` });
    }
    if (targetMmDoc.active === false) {
      return res
        .status(400)
        .json({ message: `Convert SKU ${targetSkuN} is deactivated` });
    }

    const targetProductName = String(
      targetMmDoc.product_name || targetMmDoc.name || "",
    )
      .trim()
      .toUpperCase();

    const returnInvDoc = await inventoryCol.findOne({
      sku: returnSkuN,
      location: locationN,
    });
    const returnProductName = String(returnInvDoc?.product_name || "RETURN")
      .trim()
      .toUpperCase();

    const returnDeductResult = await inventoryCol.updateOne(
      { sku: returnSkuN, location: locationN, quantity: { $gte: qtyN } },
      { $inc: { quantity: -qtyN } },
    );
    if (returnDeductResult.modifiedCount === 0) {
      return res.status(400).json({
        message: `Insufficient return stock for ${returnSkuN} at ${locationN}`,
      });
    }

    const amazonDeductResult = await inventoryCol.updateOne(
      { sku: targetSkuN, location: "AMAZON", quantity: { $gte: qtyN } },
      { $inc: { quantity: -qtyN } },
    );
    if (amazonDeductResult.modifiedCount === 0) {
      await inventoryCol.updateOne(
        { sku: returnSkuN, location: locationN },
        { $inc: { quantity: qtyN } },
      );
      return res.status(400).json({
        message: `Insufficient Amazon stock for ${targetSkuN}`,
      });
    }

    await inventoryCol.updateOne(
      { sku: targetSkuN, location: locationN },
      {
        $set: { product_name: targetProductName },
        $inc: { quantity: qtyN },
      },
      { upsert: true },
    );

    const txnNum = await getNextReturnTransactionNum();
    const timestamp = new Date();

    const returnTx = {
      timestamp,
      sku: returnSkuN,
      product_name: returnProductName,
      location: locationN,
      type: "return_convert",
      qty: -qtyN,
      outbound_qty: qtyN,
      reason: `Return Convert out to ${targetSkuN}`,
      converted_to_sku: targetSkuN,
      movement_transaction_num: txnNum,
    };

    const targetTx = {
      timestamp,
      sku: targetSkuN,
      product_name: targetProductName,
      location: locationN,
      type: "return_convert",
      qty: qtyN,
      inbound_qty: qtyN,
      reason: `Return Convert in from ${returnSkuN}`,
      converted_from_sku: returnSkuN,
      amazon_qty_decreased: qtyN,
      movement_transaction_num: txnNum,
    };

    const amazonTx = {
      timestamp,
      sku: targetSkuN,
      product_name: targetProductName,
      location: "AMAZON",
      type: "return_convert",
      qty: -qtyN,
      outbound_qty: qtyN,
      reason: `Return Convert Amazon decrease for ${returnSkuN}`,
      converted_from_sku: returnSkuN,
      location_from: "AMAZON",
      location_to: locationN,
      movement_transaction_num: txnNum,
    };

    await transactionsCol.insertMany([returnTx, targetTx, amazonTx]);

    const mvDoc = buildMovementDoc("return_convert", txnNum, qtyN, locationN, [
      {
        timestamp,
        type: "return_convert",
        sku: returnSkuN,
        product_name: returnProductName,
        qty: -qtyN,
        location: locationN,
        converted_to_sku: targetSkuN,
        movement_transaction_num: txnNum,
      },
      {
        timestamp,
        type: "return_convert",
        sku: targetSkuN,
        product_name: targetProductName,
        qty: qtyN,
        location: locationN,
        converted_from_sku: returnSkuN,
        amazon_qty_decreased: qtyN,
        movement_transaction_num: txnNum,
      },
      {
        timestamp,
        type: "return_convert",
        sku: targetSkuN,
        product_name: targetProductName,
        qty: -qtyN,
        location_from: "AMAZON",
        location_to: locationN,
        converted_from_sku: returnSkuN,
        movement_transaction_num: txnNum,
      },
    ]);
    mvDoc.convert = {
      from_sku: returnSkuN,
      to_sku: targetSkuN,
      location: locationN,
      amazon_location: "AMAZON",
    };
    await movementCol.insertOne(mvDoc);

    res.json({
      success: true,
      message: `Return Convert successful. Txn: ${txnNum}`,
      txnNum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
