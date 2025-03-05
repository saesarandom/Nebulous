const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : false,
});

// Initialize the pool with the correct configuration

// Test the connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Database connection test failed:", err);
  } else {
    console.log("Database connection test successful:", res.rows[0]);
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

    // Use userId instead of id
    const userId = req.user.userId;
    console.log(`User ID from token: ${userId}, attempting to create planet`);

    if (!userId) {
      console.error("User ID is undefined in the token payload");
      return res.status(400).json({
        message: "Invalid user identification. Please log in again.",
      });
    }

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
    // Use userId instead of id
    const userId = req.user.userId;
    console.log(`Getting planet for user ID: ${userId}`);

    if (!userId) {
      console.error("User ID is undefined in the token payload");
      return res.status(400).json({
        message: "Invalid user identification. Please log in again.",
      });
    }

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
    res.status(500).json({ message: "Server error. Please try again later." });
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
    // Use userId instead of id
    const userId = req.user.userId;
    console.log(`Deleting planet for user ID: ${userId}`);

    if (!userId) {
      console.error("User ID is undefined in the token payload");
      return res.status(400).json({
        message: "Invalid user identification. Please log in again.",
      });
    }

    const result = await pool.query(
      "DELETE FROM planets WHERE user_id = $1 RETURNING *",
      [userId]
    );

    console.log(`Deleted ${result.rows.length} planets for user`);

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
