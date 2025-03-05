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
    return res
      .status(403)
      .json({ message: "Invalid or expired token: " + error.message });
  }
};

// Create sector table during initialization
async function initSectorTable() {
  try {
    // First check if the table exists
    const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'sectors'
        );
      `);

    const tableExists = tableCheck.rows[0].exists;

    if (tableExists) {
      console.log("Sectors table exists, checking columns");

      // Check if all required columns exist
      const columnCheck = await pool.query(`
          SELECT 
            column_name, 
            data_type 
          FROM 
            information_schema.columns 
          WHERE 
            table_name = 'sectors'
        `);

      const columns = columnCheck.rows.map((row) => row.column_name);

      const requiredColumns = [
        "id",
        "user_id",
        "sector_code",
        "square_x",
        "square_y",
        "inner_x",
        "inner_y",
        "created_at",
      ];

      const missingColumns = requiredColumns.filter(
        (col) => !columns.includes(col)
      );

      if (missingColumns.length > 0) {
        console.log("Missing columns in sectors table:", missingColumns);

        // Alter the table to add missing columns
        for (const column of missingColumns) {
          let dataType = "";

          switch (column) {
            case "id":
              await pool.query(
                `ALTER TABLE sectors ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY`
              );
              break;
            case "user_id":
              await pool.query(`
                  ALTER TABLE sectors 
                  ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE NOT NULL,
                  ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                `);
              break;
            case "sector_code":
              await pool.query(
                `ALTER TABLE sectors ADD COLUMN IF NOT EXISTS sector_code VARCHAR(20) NOT NULL`
              );
              break;
            case "square_x":
            case "square_y":
              await pool.query(
                `ALTER TABLE sectors ADD COLUMN IF NOT EXISTS ${column} DOUBLE PRECISION NOT NULL`
              );
              break;
            case "inner_x":
            case "inner_y":
              await pool.query(
                `ALTER TABLE sectors ADD COLUMN IF NOT EXISTS ${column} INTEGER NOT NULL`
              );
              break;
            case "created_at":
              await pool.query(`
                  ALTER TABLE sectors 
                  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                `);
              break;
          }
        }

        console.log("Added missing columns to sectors table");
      } else {
        console.log("All required columns exist in sectors table");
      }
    } else {
      console.log("Creating sectors table from scratch");

      // Create the table
      await pool.query(`
          CREATE TABLE sectors (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE NOT NULL,
            sector_code VARCHAR(20) NOT NULL,
            square_x DOUBLE PRECISION NOT NULL,
            square_y DOUBLE PRECISION NOT NULL,
            inner_x INTEGER NOT NULL,
            inner_y INTEGER NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);

      console.log("Sectors table created successfully");
    }

    // Count existing records
    const countResult = await pool.query("SELECT COUNT(*) FROM sectors");
    console.log(`Sectors table has ${countResult.rows[0].count} records`);
  } catch (err) {
    console.error("Error initializing sectors table:", err);
  }
}

// Route to save a user's sector
router.post("/api/sector/assign", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sector, position } = req.body;

    if (!userId || !sector || !position) {
      return res.status(400).json({
        message: "Missing required data (userId, sector, or position)",
      });
    }

    // Check if user already has a sector
    const existingSector = await pool.query(
      "SELECT * FROM sectors WHERE user_id = $1",
      [userId]
    );

    if (existingSector.rows.length > 0) {
      return res.status(400).json({
        message: "User already has an assigned sector",
      });
    }

    // Extract position data
    const { squareX, squareY, innerX, innerY } = position;

    // Insert new sector
    const result = await pool.query(
      `INSERT INTO sectors (user_id, sector_code, square_x, square_y, inner_x, inner_y) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [userId, sector, squareX, squareY, innerX, innerY]
    );

    res.status(201).json({
      message: "Sector assigned successfully",
      sector: result.rows[0],
    });
  } catch (error) {
    console.error("Error assigning sector:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
});

router.post("/api/sector/sync", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sector, position } = req.body;

    if (!userId || !sector || !position) {
      return res.status(400).json({
        message: "Missing required data (userId, sector, or position)",
      });
    }

    console.log(`Syncing sector for user ${userId}: ${sector}`, position);

    // Check if user already has a sector in the database
    const existingSector = await pool.query(
      "SELECT * FROM sectors WHERE user_id = $1",
      [userId]
    );

    // If sector already exists, update it
    if (existingSector.rows.length > 0) {
      console.log(`Updating existing sector for user ${userId}`);

      const result = await pool.query(
        `UPDATE sectors 
           SET sector_code = $1, square_x = $2, square_y = $3, inner_x = $4, inner_y = $5 
           WHERE user_id = $6
           RETURNING *`,
        [
          sector,
          position.squareX,
          position.squareY,
          position.innerX,
          position.innerY,
          userId,
        ]
      );

      res.status(200).json({
        message: "Sector updated successfully",
        sector: result.rows[0],
      });
    } else {
      // If no sector exists, create a new one
      console.log(`Creating new sector for user ${userId}`);

      const result = await pool.query(
        `INSERT INTO sectors (user_id, sector_code, square_x, square_y, inner_x, inner_y) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING *`,
        [
          userId,
          sector,
          position.squareX,
          position.squareY,
          position.innerX,
          position.innerY,
        ]
      );

      res.status(201).json({
        message: "Sector created successfully",
        sector: result.rows[0],
      });
    }
  } catch (error) {
    console.error("Error syncing sector:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
});

// Route to get user's sector
router.get("/api/sector", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user identification",
      });
    }

    const result = await pool.query(
      "SELECT * FROM sectors WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "No sector found for this user",
      });
    }

    res.status(200).json({
      sector: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching sector:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
    });
  }
});

// Route to get all users' sectors (for displaying other players on the map)
router.get("/api/sectors/all", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user identification",
      });
    }

    // Join sectors with users to get usernames
    const result = await pool.query(
      `SELECT s.*, u.username 
       FROM sectors s
       JOIN users u ON s.user_id = u.id`
    );

    res.status(200).json({
      sectors: result.rows,
      currentUserId: userId,
    });
  } catch (error) {
    console.error("Error fetching all sectors:", error);
    res.status(500).json({
      message: "Server error. Please try again later.",
    });
  }
});

router.get("/api/sectors/diagnose", authenticateToken, async (req, res) => {
  try {
    // Only allow this in development or with special permission
    const isAdmin = req.user.username === "admin"; // You can change this logic

    // Get table info
    const tableInfo = await pool.query(`
        SELECT 
          table_name, 
          column_name, 
          data_type 
        FROM 
          information_schema.columns 
        WHERE 
          table_name = 'sectors'
      `);

    // Get count of sectors
    const sectorCount = await pool.query(`
        SELECT COUNT(*) FROM sectors
      `);

    // Get error entries if any
    const errorEntries = await pool.query(`
        SELECT 
          s.*, 
          u.username 
        FROM 
          sectors s 
        LEFT JOIN 
          users u ON s.user_id = u.id 
        WHERE 
          s.sector_code IS NULL OR 
          s.square_x IS NULL OR 
          s.square_y IS NULL OR 
          s.inner_x IS NULL OR 
          s.inner_y IS NULL
        LIMIT 10
      `);

    // Get the most recent entries
    const recentEntries = await pool.query(`
        SELECT 
          s.id, 
          s.user_id, 
          s.sector_code, 
          u.username,
          s.created_at
        FROM 
          sectors s
        JOIN 
          users u ON s.user_id = u.id
        ORDER BY 
          s.created_at DESC
        LIMIT 5
      `);

    // Create diagnostics object
    const diagnostics = {
      tableExists: tableInfo.rows.length > 0,
      tableColumns: tableInfo.rows,
      sectorCount: sectorCount.rows[0].count,
      errorEntries: errorEntries.rows,
      recentEntries: recentEntries.rows,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(diagnostics);
  } catch (error) {
    console.error("Error in diagnostic endpoint:", error);
    res.status(500).json({
      message: "Server error running diagnostics",
      error: error.message,
    });
  }
});

// router.get("/api/sectors/populate-dummy", async (req, res) => {
//   try {
//     // This is just a temporary endpoint for debugging/demonstration
//     // Would be better to secure this in production

//     // First, let's create some dummy sectors for users who don't have one
//     const usersWithoutSectors = await pool.query(`
//         SELECT u.id, u.username
//         FROM users u
//         LEFT JOIN sectors s ON u.id = s.user_id
//         WHERE s.id IS NULL
//       `);

//     console.log(
//       `Found ${usersWithoutSectors.rows.length} users without sectors`
//     );

//     let createdCount = 0;

//     for (const user of usersWithoutSectors.rows) {
//       // Generate a random position
//       const gridSize = 32;
//       const squareSize = 640 / gridSize;
//       const randGridX = Math.floor(Math.random() * gridSize);
//       const randGridY = Math.floor(Math.random() * gridSize);
//       const squareX = randGridX * squareSize;
//       const squareY = randGridY * squareSize;
//       const innerX = Math.floor(Math.random() * 10);
//       const innerY = Math.floor(Math.random() * 10);

//       // Generate a sector code like A1B2C3D45
//       function getRandomSectorPart() {
//         const letters = "ABCD";
//         const letter = letters.charAt(Math.floor(Math.random() * 4));
//         const number = Math.floor(Math.random() * 4) + 1;
//         return letter + number;
//       }

//       const sectorCode =
//         getRandomSectorPart() +
//         getRandomSectorPart() +
//         getRandomSectorPart() +
//         getRandomSectorPart() +
//         String(Math.floor(Math.random() * 100)).padStart(2, "0");

//       // Insert the sector
//       await pool.query(
//         `
//           INSERT INTO sectors
//             (user_id, sector_code, square_x, square_y, inner_x, inner_y)
//           VALUES
//             ($1, $2, $3, $4, $5, $6)
//           ON CONFLICT (user_id) DO NOTHING
//         `,
//         [user.id, sectorCode, squareX, squareY, innerX, innerY]
//       );

//       createdCount++;
//     }

//     res.status(200).json({
//       message: `Created ${createdCount} demo sectors`,
//       usersProcessed: usersWithoutSectors.rows.length,
//       usersWithoutSectors: usersWithoutSectors.rows.map((u) => u.username),
//     });
//   } catch (error) {
//     console.error("Error in populate sectors endpoint:", error);
//     res.status(500).json({
//       message: "Server error during sector population",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
