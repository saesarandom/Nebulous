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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

// Resource definitions - easier to maintain in one place
const RESOURCES = {
  wood: { baseRate: { min: 5, max: 15 }, chance: 1 / 1 }, // 100% chance
  stone: { baseRate: { min: 4, max: 13 }, chance: 1 / 1.05 }, // ~95% chance
  iron: { baseRate: { min: 3, max: 10 }, chance: 1 / 1.1 }, // ~91% chance
  copper: { baseRate: { min: 2, max: 9 }, chance: 1 / 1.11 }, // ~90% chance
  coal: { baseRate: { min: 1, max: 7 }, chance: 1 / 1.18 }, // ~85% chance
  platina: { baseRate: { min: 0, max: 0 }, chance: 0 },
  palladium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  iridium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  rhodium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  osmium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  ruthenium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  rhenium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  galium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  terbium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  plasmatron: { baseRate: { min: 0, max: 0 }, chance: 0 },
  chromitium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  neptunium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  xenarium: { baseRate: { min: 0, max: 0 }, chance: 0 },
  protorium: { baseRate: { min: 0, max: 0 }, chance: 0 },
};

// Initialize database table if needed
async function initResourceTable() {
  try {
    // Check if the planets table has a resources column
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'planets' AND column_name = 'resources'
    `);

    if (checkResult.rows.length === 0) {
      console.log("Adding resources column to planets table");
      // Add the resources column to the planets table
      await pool.query(`
        ALTER TABLE planets 
        ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '{}'
      `);
    }

    console.log("Resource table initialization complete");
  } catch (error) {
    console.error("Error initializing resource table:", error);
  }
}

// Call initialization on module load
initResourceTable();

// Get user resources
// Add these routes to your resourceRoutes.js file

// Route to get user resources
router.get("/api/resources", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the planet and its resources
    const result = await pool.query(
      "SELECT resources FROM planets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No planet found. Please create one first." });
    }

    // If resources are null or undefined, initialize with empty object
    const resources = result.rows[0].resources || {};

    // Return the current resources
    res.status(200).json({ resources });
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

router.get("/api/debug/resources", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the planet and its resources
    const result = await pool.query(
      "SELECT resources FROM planets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No planet found." });
    }

    // Return the resources directly
    res.status(200).json({
      message: "Current resources in database",
      resources: result.rows[0].resources || {},
      resourcesType: typeof result.rows[0].resources,
      timeChecked: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking resources:", error);
    res.status(500).json({ message: "Server error checking resources." });
  }
});

// Update user resources
router.post("/api/resources/sync", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resources, lastSync } = req.body;

    if (!resources || typeof resources !== "object") {
      return res.status(400).json({ message: "Invalid resources data." });
    }

    // Update the resources in the database
    const result = await pool.query(
      "UPDATE planets SET resources = $1 WHERE user_id = $2 RETURNING resources",
      [resources, userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No planet found. Please create one first." });
    }

    // Return the updated resources
    res.status(200).json({
      message: "Resources synced successfully",
      resources: result.rows[0].resources,
      syncTime: Date.now(),
    });
  } catch (error) {
    console.error("Error syncing resources:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Initialize resources for a new planet
router.post(
  "/api/resources/initialize",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      // First check if resources already exist
      const checkResult = await pool.query(
        "SELECT resources FROM planets WHERE user_id = $1",
        [userId]
      );

      if (checkResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: "No planet found. Please create one first." });
      }

      // If resources already have data, don't reinitialize
      const existingResources = checkResult.rows[0].resources;
      if (existingResources && Object.keys(existingResources).length > 0) {
        return res.status(200).json({
          message: "Resources already initialized",
          resources: existingResources,
        });
      }

      // Initialize all resources to zero with appropriate metadata
      const initialResources = {};
      Object.keys(RESOURCES).forEach((resource) => {
        initialResources[resource] = {
          amount: 0,
          total: 0,
          rate: RESOURCES[resource].baseRate,
          chance: RESOURCES[resource].chance,
          lastUpdated: Date.now(),
        };
      });

      // Update the database
      const result = await pool.query(
        "UPDATE planets SET resources = $1 WHERE user_id = $2 RETURNING resources",
        [initialResources, userId]
      );

      res.status(200).json({
        message: "Resources initialized successfully",
        resources: result.rows[0].resources,
        syncTime: Date.now(),
      });
    } catch (error) {
      console.error("Error initializing resources:", error);
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  }
);

// Add new API routes here

router.post("/api/planet/resources", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { resources } = req.body;

    if (!resources || typeof resources !== "object") {
      return res.status(400).json({ message: "Invalid resources data." });
    }

    // Update the resources in the database
    const result = await pool.query(
      "UPDATE planets SET resources = $1 WHERE user_id = $2 RETURNING id",
      [resources, userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No planet found. Please create one first." });
    }

    res.status(200).json({
      message: "Planet resources updated successfully",
      planetId: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error updating planet resources:", error);
    res.status(500).json({ message: "Server error updating resources." });
  }
});

module.exports = router;
