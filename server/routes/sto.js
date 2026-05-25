require("dotenv").config();
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const {
  getNextSTOTransactionNum,
  buildMovementDoc,
} = require("../utils/movement");

// Multer setup for PDF upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// Reverting to single file upload. The frontend will loop and call this one-by-one.
router.post("/process-fba-pdf", upload.single("pdf"), async (req, res) => {
  try {
    console.log("PDF processing request received.");

    if (!req.file) {
      return res.status(400).json({ message: "No PDF file uploaded" });
    }

    if (!process.env.GEMINI_API) {
      return res
        .status(500)
        .json({ message: "Server misconfiguration: Missing AI API key." });
    }

    const pdfBuffer = req.file.buffer;
    const base64Pdf = pdfBuffer.toString("base64");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
    const modelName = "gemini-3.5-flash";

    // Using EXACTLY Gemini 3.0 Flash with JSON Mode and Safety Filters off
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const prompt = `Analyze the attached PDF. The document consists of pairs: every odd-numbered page is an Amazon FBA label and every even-numbered page is the corresponding UPS shipping label for the same box (e.g., Page 1 is Box 1 FBA, Page 2 is Box 1 UPS).

Extract the FBA Shipment ID, UPS Tracking Number, and Weight for each box, moving sequentially through the document.

You MUST return a JSON array of objects. Each object must represent a box and contain exactly these keys:
- "boxNumber" (string, e.g., "Box 1")
- "fbaShipmentId" (string)
- "quantity" (quantity is found in FBA label labled as "qty")
- "trackingNumber" (string)
- "weight" (string, e.g., "28 LBS")`;

    console.log(
      `Calling Gemini (model: ${modelName}) for file: ${req.file.originalname}`,
    );
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          data: base64Pdf,
          mimeType: "application/pdf",
        },
      },
    ]);

    const candidate = result.response.candidates[0];
    if (candidate?.finishReason !== "STOP") {
      throw new Error(
        `Generation blocked by Google AI. Reason: ${candidate?.finishReason}`,
      );
    }

    let responseText = result.response.text();
    console.log("Gemini Raw Response:", responseText);

    // Sanitize JSON just in case Gemini wrapped it in markdown
    responseText = responseText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const extractedData = JSON.parse(responseText);
    const tokens = result.response.usageMetadata?.totalTokenCount || 0;

    res.json({ success: true, data: extractedData, tokens });
  } catch (err) {
    console.error("CRITICAL ERROR processing PDF:", err.message);
    res.status(500).json({
      message: "Failed to process PDF",
      error: err.message,
    });
  }
});

router.post("/submit-bulk-fba", async (req, res) => {
  const { shipments, fromLocation } = req.body;
  try {
    const db = mongoose.connection.db;
    const inventoryCol = db.collection("inventory");
    const transactionsCol = db.collection("transactions");
    const mmCol = db.collection("MM");
    const movementCol = db.collection("movement");

    const from_loc_n = String(fromLocation).trim().toUpperCase();
    const to_loc_n = "AMAZON";
    const timestamp = new Date();
    const results = [];

    // Check for duplicate tracking numbers in the database before proceeding
    // We remove all spaces for comparison as per user request
    const trackingNumbers = shipments
      .map((s) => String(s.trackingNumber || "").replace(/\s+/g, ""))
      .filter((t) => t !== "");

    if (trackingNumbers.length > 0) {
      // Use $expr with $replaceAll to compare space-trimmed values in MongoDB
      // Or more simply, since we might have many tracking numbers, we can fetch potential matches
      // and do the space-insensitive comparison in JS, or use a regex-based approach.
      // Given the requirement to trim spaces from the database side as well:
      const potentialMatches = await transactionsCol
        .find({
          shipment_id: { $exists: true, $ne: "" },
        })
        .toArray();

      const duplicate = potentialMatches.find((tx) => {
        const dbTracking = String(tx.shipment_id || "").replace(/\s+/g, "");
        return trackingNumbers.includes(dbTracking);
      });

      if (duplicate) {
        return res.status(400).json({
          message: `Duplicate tracking number found: ${duplicate.shipment_id}. This shipment has already been processed.`,
        });
      }
    }

    for (const ship of shipments) {
      try {
        const sku_n = String(ship.sku).trim().toUpperCase();
        const qty_n = parseInt(ship.quantity);

        console.log(
          `[FBA] Processing shipment for SKU: ${sku_n}, Qty: ${qty_n}`,
        );

        if (!sku_n || isNaN(qty_n) || qty_n <= 0) {
          console.log(
            `[FBA] Skipping invalid SKU or quantity: ${sku_n}, ${qty_n}`,
          );
          continue;
        }

        const mmDoc = await mmCol.findOne({ sku: sku_n });
        if (mmDoc && mmDoc.active === false) {
          console.log(`[FBA] Skipping inactive SKU: ${sku_n}`);
          continue;
        }

        const invDoc = await inventoryCol.findOne({
          sku: sku_n,
          location: from_loc_n,
        });
        const productName = String(
          invDoc?.product_name ||
            mmDoc?.product_name ||
            mmDoc?.name ||
            "RETURN",
        )
          .trim()
          .toUpperCase();

        console.log(`[FBA] Updating inventory for ${sku_n} at ${from_loc_n}`);
        const updateResult = await inventoryCol.updateOne(
          { sku: sku_n, location: from_loc_n, quantity: { $gte: qty_n } },
          { $inc: { quantity: -qty_n } },
        );

        if (updateResult.modifiedCount === 0) {
          console.log(`[FBA] Insufficient stock for ${sku_n} at ${from_loc_n}`);
          continue;
        }

        console.log(
          `[FBA] Inventory deducted successfully. Adding to AMAZON location.`,
        );
        await inventoryCol.updateOne(
          { sku: sku_n, location: to_loc_n },
          {
            $set: { product_name: productName },
            $inc: { quantity: qty_n },
          },
          { upsert: true },
        );

        const txnNum = await getNextSTOTransactionNum();
        console.log(`[FBA] Generated transaction number: ${txnNum}`);

        // Mapping rules:
        // shipment_id = trackingNumber
        // FBA ID = fbaShipmentId
        // tracking_number = DELETE/REMOVE

        const outboundTx = {
          timestamp,
          sku: sku_n,
          product_name: productName,
          shipment_id: String(ship.trackingNumber || "").trim(),
          "FBA ID": String(ship.fbaShipmentId || "").trim(),
          location: from_loc_n,
          type: "outbound",
          outbound_qty: qty_n,
          reason: "FBA Shipment out (PDF)",
          sto: true,
          location_from: from_loc_n,
          location_to: to_loc_n,
          movement_transaction_num: txnNum,
        };

        const inboundTx = {
          timestamp,
          sku: sku_n,
          product_name: productName,
          shipment_id: String(ship.trackingNumber || "").trim(),
          "FBA ID": String(ship.fbaShipmentId || "").trim(),
          location: to_loc_n,
          type: "inbound",
          inbound_qty: qty_n,
          reason: "FBA Shipment in (PDF)",
          sto: true,
          location_from: from_loc_n,
          location_to: to_loc_n,
          movement_transaction_num: txnNum,
        };

        console.log(`[FBA] Inserting transactions for ${sku_n}`);
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
            shipment_id: String(ship.trackingNumber || "").trim(),
            "FBA ID": String(ship.fbaShipmentId || "").trim(),
            movement_transaction_num: txnNum,
          },
        ]);
        mvDoc.delivery_locations = { from: from_loc_n, to: to_loc_n };

        console.log(`[FBA] Inserting movement record for ${sku_n}`);
        await movementCol.insertOne(mvDoc);

        console.log(
          `[FBA] Successfully processed ${sku_n} with txnNum ${txnNum}`,
        );
        results.push({ sku: sku_n, txnNum });
      } catch (shipError) {
        console.error(
          `[FBA] Error processing shipment for SKU ${ship.sku}:`,
          shipError,
        );
        // Continue processing other shipments even if one fails
        continue;
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} FBA shipments successfully.`,
      results,
    });
  } catch (err) {
    console.error("Error in bulk FBA submission:", err);
    res.status(500).json({ message: "Server error during bulk submission" });
  }
});

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

    // Check for duplicate tracking if this is an FBA shipment (to_loc is AMAZON)
    // Note: Manual STO currently doesn't have a tracking field in the request,
    // but we add this for future-proofing and consistency.
    if (to_loc_n === "AMAZON" && req.body.shipment_id) {
      const inputTracking = String(req.body.shipment_id).replace(/\s+/g, "");
      const potentialMatches = await transactionsCol
        .find({
          shipment_id: { $exists: true, $ne: "" },
        })
        .toArray();

      const duplicate = potentialMatches.find((tx) => {
        const dbTracking = String(tx.shipment_id || "").replace(/\s+/g, "");
        return dbTracking === inputTracking;
      });

      if (duplicate) {
        return res.status(400).json({
          message: `Duplicate tracking number found: ${duplicate.shipment_id}. This shipment has already been processed.`,
        });
      }
    }

    const mmDoc = await mmCol.findOne({ sku: sku_n });
    if (mmDoc && mmDoc.active === false) {
      return res.status(400).json({ message: `SKU ${sku_n} is deactivated` });
    }

    const invDoc = await inventoryCol.findOne({
      sku: sku_n,
      location: from_loc_n,
    });
    const productName = String(
      invDoc?.product_name || mmDoc?.product_name || mmDoc?.name || "RETURN",
    )
      .trim()
      .toUpperCase();

    const result = await inventoryCol.updateOne(
      { sku: sku_n, location: from_loc_n, quantity: { $gte: qty_n } },
      { $inc: { quantity: -qty_n } },
    );

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .json({ message: `Insufficient stock at ${from_loc_n}` });
    }

    await inventoryCol.updateOne(
      { sku: sku_n, location: to_loc_n },
      {
        $set: { product_name: productName },
        $inc: { quantity: qty_n },
      },
      { upsert: true },
    );

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
      reason: to_loc_n === "AMAZON" ? "FBA Shipment out" : "STO transfer out",
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
