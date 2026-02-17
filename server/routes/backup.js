const express = require("express");
const router = express.Router();
const { backup_database } = require("../utils/backup");

// @route   POST api/backup
// @desc    Backup database
// @access  Private (should be, but for now we'll keep it simple)
router.post("/", async (req, res) => {
  const { source, target } = req.body;

  if (!source || !target) {
    return res
      .status(400)
      .json({ message: "Source and target database names are required" });
  }

  const [success, message] = await backup_database(source, target);

  if (success) {
    res.json({ message });
  } else {
    res.status(500).json({ message });
  }
});

module.exports = router;
