const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Routes
app.get("/", (req, res) => {
  res.send("WMS API is running");
});

// Import and use routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/master-data", require("./routes/masterData"));
app.use("/api/inbound", require("./routes/inbound"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/outbound", require("./routes/outbound"));
app.use("/api/sto", require("./routes/sto"));
app.use("/api/transactions", require("./routes/transactions"));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
