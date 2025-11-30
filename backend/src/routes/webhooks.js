// Webhooks were removed from this service. Keep a placeholder router to avoid
// accidental requires elsewhere in the codebase.
const express = require('express');
const router = express.Router();

router.use((req, res) => {
  res.status(410).json({ error: 'webhooks removed' });
});

module.exports = router;
