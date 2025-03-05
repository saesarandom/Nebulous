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

// Test database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Planet routes - Database connection error:", err);
  } else {
    console.log("Planet routes - Database connected successfully");
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log("Auth failed: No token provided");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    // Print token for debugging (remove in production)
    console.log("Token received:", token.substring(0, 20) + "...");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded successfully:", decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res
      .status(403)
      .json({ message: "Invalid or expired token: " + error.message });
  }
};

// Route to create a new planet
router.post("/api/planet/create", authenticateToken, async (req, res) => {
  try {
    console.log("Creating planet with data:", req.body);
    const { type, size, sizeRange } = req.body;
    const userId = req.user.id;

    console.log(`User ID: ${userId}, attempting to create planet`);

    // Check if user already has a planet
    const existingPlanet = await pool.query(
      "SELECT * FROM planets WHERE user_id = $1",
      [userId]
    );

    console.log(
      `Found ${existingPlanet.rows.length} existing planets for user`
    );

    if (existingPlanet.rows.length > 0) {
      return res.status(400).json({
        message:
          "You already have a planet. Delete your existing planet first.",
      });
    }

    // Create new planet
    const result = await pool.query(
      "INSERT INTO planets (user_id, type, size, size_range, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [userId, type, size, sizeRange]
    );

    console.log("Planet created successfully:", result.rows[0]);

    res.status(201).json({
      message: "Planet created successfully!",
      planet: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating planet:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
});

// Route to get user's planet
router.get("/api/planet", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Getting planet for user ID: ${userId}`);

    const result = await pool.query(
      "SELECT * FROM planets WHERE user_id = $1",
      [userId]
    );

    console.log(`Found ${result.rows.length} planets for user`);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No planet found. Please create one." });
    }

    res.status(200).json({ planet: result.rows[0] });
  } catch (error) {
    console.error("Error fetching planet:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
});

router.get("/api/test", (req, res) => {
  try {
    res.status(200).json({
      message: "API is working correctly",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in test endpoint:", error);
    res.status(500).json({ message: "Server error in test endpoint" });
  }
});

// Test endpoint with authentication
router.get("/api/test-auth", authenticateToken, (req, res) => {
  try {
    res.status(200).json({
      message: "Authenticated API is working correctly",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in authenticated test endpoint:", error);
    res
      .status(500)
      .json({ message: "Server error in authenticated test endpoint" });
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
