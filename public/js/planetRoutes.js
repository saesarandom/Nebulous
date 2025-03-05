const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token." });
    req.user = user;
    next();
  });
};

// Route to create a new planet
router.post("/api/planet/create", authenticateToken, async (req, res) => {
  try {
    const { type, size, sizeRange } = req.body;
    const userId = req.user.id;

    // Check if user already has a planet
    const existingPlanet = await pool.query(
      "SELECT * FROM planets WHERE user_id = $1",
      [userId]
    );

    if (existingPlanet.rows.length > 0) {
      return res
        .status(400)
        .json({
          message:
            "You already have a planet. Delete your existing planet first.",
        });
    }

    // Create new planet
    const result = await pool.query(
      "INSERT INTO planets (user_id, type, size, size_range, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [userId, type, size, sizeRange]
    );

    res.status(201).json({
      message: "Planet created successfully!",
      planet: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating planet:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Route to get user's planet
router.get("/api/planet", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT * FROM planets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No planet found. Please create one." });
    }

    res.status(200).json({ planet: result.rows[0] });
  } catch (error) {
    console.error("Error fetching planet:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Route to delete a planet
router.delete("/api/planet", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "DELETE FROM planets WHERE user_id = $1 RETURNING *",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No planet found to delete." });
    }

    res.status(200).json({ message: "Planet deleted successfully." });
  } catch (error) {
    console.error("Error deleting planet:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

module.exports = router;
