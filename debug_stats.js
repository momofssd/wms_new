const mongoose = require("mongoose");

async function debug() {
  try {
    await mongoose.connect("mongodb://localhost:27017/whs-reac"); // Adjust if needed, but usually it's local
    const db = mongoose.connection.db;
    const transactionsCol = db.collection("transactions");
    const pcCol = db.collection("price_conditions");

    const txs = await transactionsCol
      .find({ type: "outbound" })
      .limit(10)
      .toArray();
    const prices = await pcCol.find({}).toArray();

    console.log("Found", txs.length, "outbound transactions");
    console.log("Found", prices.length, "price conditions");

    txs.forEach((t) => {
      const reason = String(t.reason || "").toUpperCase();
      const locTo = String(t.location_to || "").toUpperCase();
      const locFrom = String(t.location_from || "").toUpperCase();
      const loc = String(t.location || "").toUpperCase();
      const amazon = "AMAZON";
      const isSto =
        t.sto === true || reason.includes("STO") || reason.includes("FBA");
      const toIsAmazon = locTo === amazon || loc === amazon;
      const fromIsAmazon = locFrom === amazon;

      if (isSto && (toIsAmazon || fromIsAmazon)) {
        console.log(
          `FBA Candidate: SKU=${t.sku}, Qty=${t.qty}, Date=${t.timestamp}`,
        );
        const ts = new Date(t.timestamp);
        const condition = prices.find((pc) => {
          if (pc.sku !== t.sku || pc.service !== "FBA") return false;
          const from = new Date(pc.from_date);
          const to = new Date(pc.to_date);
          to.setHours(23, 59, 59, 999);
          return ts >= from && ts <= to;
        });
        console.log(`  Price found: ${condition ? condition.price : "NONE"}`);
      }

      const noToLoc =
        !t.location_to ||
        String(t.location_to).trim() === "" ||
        String(t.location_to).toLowerCase() === "none";
      if (noToLoc) {
        console.log(
          `FBM Candidate: SKU=${t.sku}, Qty=${t.qty}, Date=${t.timestamp}`,
        );
        const ts = new Date(t.timestamp);
        const condition = prices.find((pc) => {
          if (pc.sku !== t.sku || pc.service !== "FBM") return false;
          const from = new Date(pc.from_date);
          const to = new Date(pc.to_date);
          to.setHours(23, 59, 59, 999);
          return ts >= from && ts <= to;
        });
        console.log(`  Price found: ${condition ? condition.price : "NONE"}`);
      }
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
