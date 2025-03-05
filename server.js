const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const path = require("path");
const planetRoutes = require("./planetRoutes");

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(planetRoutes);

// PostgreSQL connection pool with Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Initialize database tables
async function initDb() {
  try {
    // Create users table if it doesn't exist
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          game_years DOUBLE PRECISION DEFAULT 0,
          last_login TIMESTAMP WITH TIME ZONE
        );
      `);
    console.log("Database tables initialized");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
}

// API Routes
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    // Check if username already exists
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      [username, hashedPassword]
    );

    res.status(201).json({
      message: "User registered successfully",
      userId: result.rows[0].id,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Copy these endpoints to your server.js file BEFORE the catch-all route

// Test endpoint to check if the server is working
app.get("/api/test", (req, res) => {
  res.json({ message: "API test endpoint is working" });
});

// Test endpoint to check database connection
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as time");
    res.json({
      message: "Database connection successful",
      time: result.rows[0].time,
    });
  } catch (err) {
    console.error("Database test error:", err);
    res
      .status(500)
      .json({ message: "Database connection failed", error: err.message });
  }
});

// Debug endpoint to check user's data
app.get("/api/debug-user", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, created_at, game_years, last_login FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error in debug user endpoint:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Debug endpoint to manually set game years
app.get("/api/debug-set-years/:years", authenticateToken, async (req, res) => {
  try {
    const gameYears = parseFloat(req.params.years);

    if (isNaN(gameYears)) {
      return res.status(400).json({ message: "Invalid game years value" });
    }

    // Update game years and last login time
    const result = await pool.query(
      "UPDATE users SET game_years = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2 RETURNING game_years, last_login",
      [gameYears, req.user.userId]
    );

    res.json({
      message: "Game time updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error in debug set years endpoint:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.post("/api/game-time", authenticateToken, async (req, res) => {
  try {
    const { gameYears } = req.body;

    if (typeof gameYears !== "number") {
      return res.status(400).json({ message: "Invalid game years value" });
    }

    // Update game years and last login time
    const result = await pool.query(
      "UPDATE users SET game_years = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2 RETURNING game_years, last_login",
      [gameYears, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Game time updated successfully",
      gameYears: result.rows[0].game_years,
      lastLogin: result.rows[0].last_login,
    });
  } catch (err) {
    console.error("Error updating game time:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Game time GET endpoint - simplified for debugging
app.get("/api/game-time", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT game_years, last_login FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = result.rows[0];

    // Update last_login to current time
    await pool.query(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
      [req.user.userId]
    );

    res.json({
      gameYears: userData.game_years || 0,
      lastLogin: userData.last_login,
    });
  } catch (err) {
    console.error("Error fetching game time:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// IMPORTANT: Make sure this is placed BEFORE any catch-all routes like "app.get('*', ...)"

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    // Find user by username
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = result.rows[0];

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Protected route to get user data
app.get("/api/user", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, created_at FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your_jwt_secret",
    (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }

      req.user = user;
      next();
    }
  );
}

// Serve main HTML files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Serve the section pages
const pages = [
  "planet",
  "mecha",
  "buildings",
  "extraction",
  "research",
  "events",
  "slots",
  "guide",
];

pages.forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, "public", `${page}.html`));
  });
});

// Catch-all route for undefined routes
app.get("*", (req, res) => {
  res.redirect("/");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initDb();
});

app.get("/api/debug-user", authenticateToken, async (req, res) => {
  try {
    console.log("Debug user request for userId:", req.user.userId);

    const result = await pool.query(
      "SELECT id, username, created_at, game_years, last_login FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      console.log("User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    console.log("User data:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error in debug user endpoint:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
