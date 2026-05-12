const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.get("/", async (req, res) => {
  const authHeader = req.headers.authorization;
  let allowedSkus = null;

  if (authHeader) {
    try {
      const jwt = require("jsonwebtoken");
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const db = mongoose.connection.db;
      const usersCol = db.collection("users");
      const user = await usersCol.findOne({
        _id: new mongoose.Types.ObjectId(decoded.id),
      });

      if (user && user.role?.toLowerCase() !== "admin") {
        allowedSkus = user.allowed_skus || [];
      }
    } catch (err) {
      console.error("JWT verification failed in movements route", err);
    }
  }

  try {
    const db = mongoose.connection.db;
    const movementCol = db.collection("movement");
    const mmCol = db.collection("MM");

    // Optional exact search by transaction number
    // Example: GET /api/movements?txnNum=100001
    const txnNumRaw =
      req.query.txnNum ?? req.query.transaction_num ?? req.query.transactionNum;
    const txnNum = typeof txnNumRaw === "string" ? txnNumRaw.trim() : "";

    // Fetch movements, sorted by timestamp descending by default.
    // If txnNum is provided, return ONLY the exact match.
    let mvList = [];
    if (txnNum) {
      const maybeNumber = Number(txnNum);
      const txnQuery = Number.isNaN(maybeNumber)
        ? { transaction_num: txnNum }
        : {
            $or: [
              { transaction_num: txnNum },
              { transaction_num: maybeNumber },
            ],
          };

      mvList = await movementCol
        .find(txnQuery)
        .sort({ timestamp: -1 })
        .toArray();
    } else {
      mvList = await movementCol.find({}).sort({ timestamp: -1 }).toArray();
    }

    // Get active SKUs
    const activeSkusDocs = await mmCol
      .find({}, { projection: { sku: 1, active: 1, _id: 0 } })
      .toArray();
    const activeSkus = new Set(
      activeSkusDocs
        .filter((doc) => doc.active !== false)
        .map((doc) => String(doc.sku).trim().toUpperCase()),
    );

    const normalizeSku = (sku) =>
      String(sku || "")
        .trim()
        .toUpperCase();

    // Keep only ACTIVE SKUs inside each movement's details.
    // Also drop movements that *had* details originally but end up with zero active details.
    const filteredMvList = mvList
      .map((mv) => {
        const isReturn = String(mv.movement_type).toLowerCase() === "return";
        const hadDetails = Array.isArray(mv.details) && mv.details.length > 0;
        const nextDetails = Array.isArray(mv.details)
          ? mv.details.filter((detail) => {
              const detailSku = normalizeSku(detail.sku);

              if (isReturn) return true; // Always show details for returns
              if (String(detail.product_name || "").toUpperCase() === "RETURN")
                return true; // Show return SKUs even in STO

              // If not a return and not in active SKUs (not in master data)
              // We should allow it as it might be an un-mastered return
              const isMasterData = activeSkusDocs.some(
                (d) => String(d.sku).trim().toUpperCase() === detailSku,
              );

              // Filter by allowed SKUs for non-admin users
              if (allowedSkus !== null) {
                // Allow if not in master data OR in allowed SKUs
                if (!isMasterData || allowedSkus.includes(detailSku)) {
                  return isMasterData ? activeSkus.has(detailSku) : true;
                }
                return false;
              }

              return isMasterData ? activeSkus.has(detailSku) : true;
            })
          : mv.details;

        return { ...mv, details: nextDetails, __hadDetails: hadDetails };
      })
      .filter((mv) => {
        if (!mv.__hadDetails) return true;
        return Array.isArray(mv.details) && mv.details.length > 0;
      })
      .map(({ __hadDetails, ...mv }) => mv);

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
      } else if (movementType === "return") {
        const qty = parseInt(detail.qty || detail.inbound_qty || 0);
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
      } else if (movementType === "return_convert") {
        const qty = Math.abs(parseInt(detail.qty || 0));
        const location = String(detail.location || "")
          .trim()
          .toUpperCase();
        const locFrom = String(detail.location_from || "")
          .trim()
          .toUpperCase();

        if (qty <= 0) continue;

        if (detail.converted_to_sku && location) {
          await inventoryCol.updateOne(
            { sku, location },
            { $inc: { quantity: qty } },
            { upsert: true },
          );
        } else if (detail.converted_from_sku && location) {
          await inventoryCol.updateOne(
            { sku, location },
            { $inc: { quantity: -qty } },
          );
        } else if (locFrom === "AMAZON") {
          await inventoryCol.updateOne(
            { sku, location: "AMAZON" },
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
