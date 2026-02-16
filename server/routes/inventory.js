const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.get("/", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const mmCol = db.collection("MM");

    // Fetch all inventory items with quantity > 0
    let inventory = await inventoryCol.find({ quantity: { $gt: 0 } }).toArray();

    // Fetch active SKUs
    const activeSkusDocs = await mmCol
      .find({}, { projection: { sku: 1, active: 1, _id: 0 } })
      .toArray();

    const activeSkus = new Set(
      activeSkusDocs
        .filter((doc) => doc.active !== false)
        .map((doc) => String(doc.sku).trim().toUpperCase()),
    );

    // Filter inventory by active SKUs
    inventory = inventory.filter((item) =>
      activeSkus.has(String(item.sku).trim().toUpperCase()),
    );

    res.json(inventory);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update-quantity", async (req, res) => {
  const { id, newQuantity, reducedBy, sku, productName, location } = req.body;
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const movementCol = db.collection("movement");

    // Update inventory
    await inventoryCol.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { quantity: parseInt(newQuantity) } },
    );

    // If reduced, log void transaction
    if (reducedBy > 0) {
      // Simple txn num generation for now (next_void_transaction_num logic)
      const timestamp = new Date();
      const txnNum = `VOID-${timestamp.getTime()}`;

      const txDoc = {
        timestamp,
        sku: String(sku).trim().toUpperCase(),
        product_name: String(productName).trim().toUpperCase(),
        location: String(location).trim().toUpperCase(),
        type: "void",
        void_qty: parseInt(reducedBy),
        reason: "Inventory Editor quantity reduction",
        movement_transaction_num: txnNum,
      };
      await transactionsCol.insertOne(txDoc);

      const mvDoc = {
        movement_type: "void",
        transaction_num: txnNum,
        qty: parseInt(reducedBy),
        location: String(location).trim().toUpperCase(),
        timestamp,
        details: [txDoc],
      };
      await movementCol.insertOne(mvDoc);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
