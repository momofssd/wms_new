const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const getTimestampSortValue = (timestamp) => {
  const time = new Date(timestamp).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const findPrice = (priceConditions, sku, service, timestamp) => {
  const ts = new Date(timestamp);
  const skuKey = String(sku || "")
    .trim()
    .toUpperCase();
  const serviceKey = String(service || "")
    .trim()
    .toUpperCase();

  const condition = priceConditions.find((pc) => {
    const pcSku = String(pc.sku || "")
      .trim()
      .toUpperCase();
    const pcService = String(pc.service || "")
      .trim()
      .toUpperCase();
    if (pcSku !== skuKey || pcService !== serviceKey) return false;

    const from = new Date(pc.from_date);
    const to = new Date(pc.to_date);
    to.setHours(23, 59, 59, 999);
    return ts >= from && ts <= to;
  });

  return condition ? Number(condition.price) || 0 : 0;
};

const getBaseChargeRow = (transaction, service, qty, unitPrice) => ({
  _id: transaction._id,
  row_id: `${transaction._id}-${service}`,
  timestamp: transaction.timestamp,
  sku: transaction.sku || "",
  product_name: transaction.product_name || "",
  fba_id: transaction["FBA ID"] || "",
  shipment_id: transaction.shipment_id || "",
  service,
  qty,
  unit_price: unitPrice,
  total_charge: Number((qty * unitPrice).toFixed(2)),
  invoice_pay_week: transaction.invoice_pay_week ?? "",
  invoice_payment_status: transaction.invoice_payment_status || "unpaid",
});

const buildInvoiceRows = (transactions, priceConditions, activeMaterials) => {
  const rows = [];

  transactions.forEach((transaction) => {
    const skuKey = String(transaction.sku || "")
      .trim()
      .toUpperCase();
    const material = activeMaterials.get(skuKey);
    if (!material) return;

    const chargeTransaction = {
      ...transaction,
      sku: material.sku,
      product_name: transaction.product_name || material.product_name || "",
    };
    const type = String(transaction.type || "").toLowerCase();
    const locationTo = String(transaction.location_to || "").toUpperCase();
    const reason = String(transaction.reason || "").toUpperCase();
    const isOutbound = type === "outbound";

    const isFbm =
      isOutbound &&
      (!transaction.location_to ||
        String(transaction.location_to).trim() === "" ||
        String(transaction.location_to).toLowerCase() === "none");

    if (isFbm) {
      const qty = Math.abs(
        transaction.qty ||
          transaction.inbound_qty ||
          transaction.outbound_qty ||
          0,
      );
      const unitPrice = findPrice(
        priceConditions,
        chargeTransaction.sku,
        "FBM",
        transaction.timestamp,
      );
      rows.push(getBaseChargeRow(chargeTransaction, "FBM", qty, unitPrice));
    }

    const isFba =
      isOutbound &&
      locationTo === "AMAZON" &&
      (transaction.sto === true || reason.includes("STO"));

    if (isFba) {
      const rawQty =
        transaction.qty ||
        (type === "inbound"
          ? transaction.inbound_qty
          : -transaction.outbound_qty) ||
        0;
      const qty = Math.abs(rawQty);
      const unitPrice = findPrice(
        priceConditions,
        chargeTransaction.sku,
        "FBA",
        transaction.timestamp,
      );
      rows.push(getBaseChargeRow(chargeTransaction, "FBA", qty, unitPrice));
    }
  });

  return rows.sort(
    (a, b) =>
      getTimestampSortValue(a.timestamp) - getTimestampSortValue(b.timestamp),
  );
};

const requireAdmin = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: "No token" });
    return null;
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role?.toLowerCase() !== "admin") {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    return decoded;
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
    return null;
  }
};

router.get("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const db = mongoose.connection.db;
    const transactionsCol = db.collection("transactions");
    const priceCol = db.collection("price_under");
    const mmCol = db.collection("MM");
    const txList = await transactionsCol
      .find({})
      .sort({ timestamp: 1 })
      .toArray();
    const [priceConditions, activeMaterialsList] = await Promise.all([
      priceCol.find({}).toArray(),
      mmCol
        .find(
          { active: true },
          { projection: { sku: 1, product_name: 1, _id: 0 } },
        )
        .toArray(),
    ]);
    const activeMaterials = new Map(
      activeMaterialsList.map((material) => [
        String(material.sku || "")
          .trim()
          .toUpperCase(),
        {
          sku: String(material.sku || "")
            .trim()
            .toUpperCase(),
          product_name: material.product_name || "",
        },
      ]),
    );

    res.json(buildInvoiceRows(txList, priceConditions, activeMaterials));
  } catch (err) {
    console.error("Error fetching invoice transactions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/bulk", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { ids, pay_week, payment_status } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "No transaction IDs provided" });
  }

  const objectIds = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length !== ids.length) {
    return res.status(400).json({ message: "Invalid transaction ID" });
  }

  const setFields = { invoice_updated_at: new Date() };
  const unsetFields = {};

  if (Object.prototype.hasOwnProperty.call(req.body, "pay_week")) {
    if (pay_week === "" || pay_week === null) {
      unsetFields.invoice_pay_week = "";
    } else {
      const parsedPayWeek = Number(pay_week);
      if (
        !Number.isFinite(parsedPayWeek) ||
        !Number.isInteger(parsedPayWeek) ||
        parsedPayWeek < 1
      ) {
        return res.status(400).json({ message: "Pay week must be a number" });
      }
      setFields.invoice_pay_week = parsedPayWeek;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "payment_status")) {
    const status = String(payment_status || "").toLowerCase();
    if (!["paid", "unpaid"].includes(status)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }
    setFields.invoice_payment_status = status;
  }

  if (
    Object.keys(setFields).length === 1 &&
    Object.keys(unsetFields).length === 0
  ) {
    return res.status(400).json({ message: "No invoice fields provided" });
  }

  const update = { $set: setFields };
  if (Object.keys(unsetFields).length > 0) {
    update.$unset = unsetFields;
  }

  try {
    const db = mongoose.connection.db;
    const transactionsCol = db.collection("transactions");
    const result = await transactionsCol.updateMany(
      { _id: { $in: objectIds } },
      update,
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating invoice transactions:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
