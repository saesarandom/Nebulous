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

// Route to get game time
app.get("/api/game-time", authenticateToken, async (req, res) => {
  try {
    // Use userId instead of id
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ message: "Invalid user identification" });
    }

    // Get the user's game years from the database
    const result = await pool.query(
      "SELECT game_years FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ gameYears: result.rows[0].game_years || 0 });
  } catch (error) {
    console.error("Error fetching game time:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Route to update game time
app.post("/api/game-time", authenticateToken, async (req, res) => {
  try {
    // Use userId instead of id
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ message: "Invalid user identification" });
    }

    const { gameYears } = req.body;

    if (typeof gameYears !== "number") {
      return res.status(400).json({ message: "Invalid game years value." });
    }

    // Update the user's game years in the database
    await pool.query(
      "UPDATE users SET game_years = $1, last_login = NOW() WHERE id = $2",
      [gameYears, userId]
    );

    res.status(200).json({ message: "Game time updated successfully." });
  } catch (error) {
    console.error("Error updating game time:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});
