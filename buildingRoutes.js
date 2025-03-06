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

// Initialize building database table
async function initBuildingTable() {
  try {
    // Check if the planets table has a buildings column
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'planets' AND column_name = 'buildings'
    `);

    if (checkResult.rows.length === 0) {
      console.log("Adding buildings column to planets table");
      // Add the buildings column to the planets table
      await pool.query(`
        ALTER TABLE planets 
        ADD COLUMN IF NOT EXISTS buildings JSONB DEFAULT '{}'
      `);
    }

    console.log("Building table initialization complete");
  } catch (error) {
    console.error("Error initializing building table:", error);
  }
}

// Initialize table on module load
initBuildingTable();

// Route to get user buildings
router.get("/api/buildings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`Fetching buildings for user: ${userId}`);

    // Get the planet and its buildings
    const result = await pool.query(
      "SELECT buildings FROM planets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      console.log(`No planet found for user ${userId}`);
      return res
        .status(404)
        .json({ message: "No planet found. Please create one first." });
    }

    // If buildings are null or undefined, initialize with empty object
    const buildings = result.rows[0].buildings || {};
    console.log(`Retrieved buildings for user ${userId}:`, buildings);

    // Return the current buildings
    res.status(200).json({ buildings });
  } catch (error) {
    console.error("Error fetching buildings:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Route to update buildings
router.post("/api/buildings/sync", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { buildings, blueprints } = req.body;

    console.log(`Syncing buildings for user ${userId}:`, {
      buildings: buildings,
      blueprints: blueprints,
    });

    if (!buildings || typeof buildings !== "object") {
      console.error("Invalid buildings data received");
      return res.status(400).json({ message: "Invalid buildings data." });
    }

    // Create a combined data object for buildings and blueprints
    const buildingData = {
      buildings: buildings,
      blueprints: blueprints || {},
    };

    console.log(`Building data to save:`, JSON.stringify(buildingData));

    // Update the buildings in the database
    const result = await pool.query(
      "UPDATE planets SET buildings = $1 WHERE user_id = $2 RETURNING buildings",
      [buildingData, userId]
    );

    if (result.rows.length === 0) {
      console.log(`Planet not found for user ${userId} when syncing buildings`);
      return res
        .status(404)
        .json({ message: "No planet found. Please create one first." });
    }

    console.log(`Buildings successfully updated for user ${userId}`);

    // Return the updated buildings
    res.status(200).json({
      message: "Buildings synced successfully",
      buildings: result.rows[0].buildings,
      syncTime: Date.now(),
    });
  } catch (error) {
    console.error("Error syncing buildings:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Debug endpoint to check building data
router.get("/api/debug/buildings", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the planet and its buildings
    const result = await pool.query(
      "SELECT buildings FROM planets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No planet found." });
    }

    // Return the buildings directly
    res.status(200).json({
      message: "Current buildings in database",
      buildings: result.rows[0].buildings || {},
      buildingsType: typeof result.rows[0].buildings,
      timeChecked: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking buildings:", error);
    res.status(500).json({ message: "Server error checking buildings." });
  }
});

// Route to force set buildings data (for debugging/fixing)
router.post("/api/debug/buildings/set", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { buildings, blueprints } = req.body;

    console.log(`Force setting buildings for user ${userId}`);

    // Create a test building data object
    const buildingData =
      buildings && blueprints
        ? {
            buildings,
            blueprints,
          }
        : {
            buildings: {
              windTurbine: 1,
              thermalTower: 1,
              silo: 1,
            },
            blueprints: {
              windTurbine: true,
              thermalTower: true,
              miningMachine: true,
              silo: true,
              decomposer: true,
              waterPump: true,
              syntheticFurnace: true,
              casino: false,
            },
          };

    // Directly update the buildings column in the database
    const result = await pool.query(
      "UPDATE planets SET buildings = $1 WHERE user_id = $2 RETURNING buildings",
      [buildingData, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No planet found to update." });
    }

    res.status(200).json({
      message: "Building data set successfully",
      buildings: result.rows[0].buildings,
    });
  } catch (error) {
    console.error("Error setting building data:", error);
    res.status(500).json({ message: "Server error setting building data." });
  }
});

module.exports = router;
