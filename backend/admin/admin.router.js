// backend/admin/admin.routes.js
const express = require("express");
const router = express.Router();
const db = require("../database");
const auth = require("../middleware/auth");

router.use(auth);

router.get("/users", (req, res) => {
  db.all(`SELECT * FROM users`, [], (_, rows) => res.json(rows));
});

router.get("/companies", (req, res) => {
  db.all(`SELECT * FROM companies`, [], (_, rows) => res.json(rows));
});

router.get("/payments", (req, res) => {
  db.all(`SELECT * FROM payments`, [], (_, rows) => res.json(rows));
});

module.exports = router;