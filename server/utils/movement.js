const mongoose = require("mongoose");

const getNextSTOTransactionNum = async () => {
  const db = mongoose.connection.db;
  const movementCol = db.collection("movement");

  const last = await movementCol
    .find(
      { movement_type: "sto", transaction_num: { $regex: /^\d{5}$/ } },
      { projection: { _id: 0, transaction_num: 1 } },
    )
    .sort({ transaction_num: -1 })
    .limit(1)
    .next();

  if (last) {
    const lastNum = String(last.transaction_num).trim();
    if (/^\d+$/.test(lastNum)) {
      let nxt = parseInt(lastNum) + 1;
      if (nxt < 10000) nxt = 10000;
      return String(nxt).padStart(5, "0");
    }
  }

  return "10000";
};

const getNextOutboundTransactionNum = async () => {
  const db = mongoose.connection.db;
  const movementCol = db.collection("movement");

  let maxInt = null;
  const prefix = "2";
  const digits = 8;

  try {
    const candidates = await movementCol
      .find(
        { transaction_num: { $regex: new RegExp(`^${prefix}\\d+$`) } },
        { projection: { _id: 0, transaction_num: 1 } },
      )
      .sort({ transaction_num: -1 })
      .limit(50)
      .toArray();

    for (const doc of candidates) {
      const s = String(doc.transaction_num).trim();
      if (!s.startsWith(prefix) || !/^\d+$/.test(s.slice(prefix.length))) {
        continue;
      }
      const v = parseInt(s);
      if (maxInt === null || v > maxInt) {
        maxInt = v;
      }
    }
  } catch (err) {}

  if (maxInt !== null) {
    const nxtInt = maxInt + 1;
    return String(nxtInt).padStart(
      Math.max(digits, String(nxtInt).length),
      "0",
    );
  }

  const startInt = parseInt(prefix + "0".repeat(digits - 1));
  return String(startInt).padStart(digits, "0");
};

const getNextInboundTransactionNum = async () => {
  const db = mongoose.connection.db;
  const movementCol = db.collection("movement");
  const counters = db.collection("counters");

  let base = 100000;
  try {
    const docs = await movementCol
      .find({
        movement_type: "inbound",
        transaction_num: { $regex: /^\d+$/ },
      })
      .sort({ transaction_num: -1 })
      .limit(200)
      .toArray();

    for (const d of docs) {
      const s = String(d.transaction_num).trim();
      const v = parseInt(s);
      if (v >= base && v < 200000) {
        base = Math.max(base, v);
      }
    }
  } catch (err) {
    // Ignore errors in discovering base
  }

  await counters.updateOne(
    { _id: "inbound_transaction_num" },
    { $setOnInsert: { seq: base } },
    { upsert: true },
  );

  const updated = await counters.findOneAndUpdate(
    { _id: "inbound_transaction_num" },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );

  let nxtInt = updated.seq || base + 1;
  if (nxtInt < 100000) nxtInt = 100000;
  if (nxtInt >= 200000) nxtInt = 199999;
  return String(nxtInt).padStart(6, "0");
};

const buildMovementDoc = (
  movementType,
  transactionNum,
  qty,
  location,
  details,
) => {
  return {
    timestamp: new Date(),
    movement_type: String(movementType).trim().toLowerCase(),
    transaction_num: String(transactionNum),
    qty: parseInt(qty),
    location: String(location).trim().toUpperCase(),
    details: details,
  };
};

module.exports = {
  getNextInboundTransactionNum,
  getNextOutboundTransactionNum,
  getNextSTOTransactionNum,
  buildMovementDoc,
};
