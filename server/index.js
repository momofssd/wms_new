const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Database connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// API Routes (these must come BEFORE static file serving)
app.use("/api/auth", require("./routes/auth"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/master-data", require("./routes/masterData"));
app.use("/api/inbound", require("./routes/inbound"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/outbound", require("./routes/outbound"));
app.use("/api/sto", require("./routes/sto"));
app.use("/api/transactions", require("./routes/transactions"));

// Serve static files from React build (in production)
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/dist")));

  // Handle React routing, return all requests to React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
  });
} else {
  // Development fallback
  app.get("/", (req, res) => {
    res.send("WMS API is running");
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
