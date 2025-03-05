// Improved time elapsed counter for Nebulous game
// Conversion rate: 1 real second = 2.777777778 game years

// Global variables
let timeCounterElement = null;
let updateInterval = null;
let isSyncing = false;

// Initialize time counter
async function initializeTimeCounter() {
  console.log("Time counter initializing");

  // Check if we're on a page that should show the counter
  if (!shouldShowCounter()) {
    console.log("Not on a display page, skipping counter");
    return;
  }

  // Check for login token
  const token = localStorage.getItem("token");
  if (!token) {
    console.log("No token found, not initializing counter");
    return;
  }

  timeCounterElement = document.getElementById("game-time-counter");
  if (!timeCounterElement) {
    timeCounterElement = document.createElement("div");
    timeCounterElement.id = "game-time-counter";
    timeCounterElement.className = "game-time-counter";
    // Remove inline styles to let CSS handle the positioning
    document.body.appendChild(timeCounterElement);
  }

  // Set loading state
  timeCounterElement.innerHTML = `
        <div style="font-size:12px;color:#aaa;">Time Elapsed:</div>
        <div style="font-size:16px;font-weight:bold;color:#4fd1c5;">Loading...</div>
    `;

  try {
    // Get game time from server
    const response = await fetch("/api/game-time", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to get game time:", response.status);
      timeCounterElement.innerHTML = `
                <div style="font-size:12px;color:#aaa;">Time Elapsed:</div>
                <div style="font-size:16px;font-weight:bold;color:red;">Error (${response.status})</div>
            `;
      return;
    }

    const data = await response.json();
    console.log("Received game time data:", data);

    // Save the current server time and initialize the counter
    localStorage.setItem("gameYears", data.gameYears || 0);
    localStorage.setItem("lastSyncTime", Date.now().toString());

    // Start the counter update
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateTimeDisplay();
    updateInterval = setInterval(updateTimeDisplay, 400);

    // Set up periodic sync (every 5 minutes)
    setInterval(syncWithServer, 5 * 60 * 1000);

    console.log("Time counter initialized with:", data.gameYears, "years");
  } catch (error) {
    console.error("Error initializing time counter:", error);
    timeCounterElement.innerHTML = `
            <div style="font-size:12px;color:#aaa;">Time Elapsed:</div>
            <div style="font-size:16px;font-weight:bold;color:red;">Error</div>
        `;
  }
}

// Update the time display
function updateTimeDisplay() {
  if (!timeCounterElement) return;

  // Get stored values
  const baseGameYears = parseFloat(localStorage.getItem("gameYears") || "0");
  const lastSyncTime = parseInt(
    localStorage.getItem("lastSyncTime") || Date.now()
  );

  // Calculate seconds elapsed since last sync
  const secondsElapsed = (Date.now() - lastSyncTime) / 1000;

  // Calculate current game years
  const additionalYears = secondsElapsed * 2.777777778;
  const currentGameYears = baseGameYears + additionalYears;

  // Format and display
  const formattedYears = Math.floor(currentGameYears).toLocaleString();
  timeCounterElement.innerHTML = `
        <div style="font-size:12px;color:#aaa;">Time Elapsed:</div>
        <div style="font-size:16px;font-weight:bold;color:#4fd1c5;">${formattedYears} Years</div>
    `;
}

// Check if we should show the counter on the current page
function shouldShowCounter() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  console.log("Current page:", currentPage);

  // Pages that should display the counter
  const pagesWithCounter = [
    "dashboard.html",
    "planet.html",
    "buildings.html",
    "extraction.html",
    "research.html",
    "events.html",
    "", // For root path
  ];

  return pagesWithCounter.includes(currentPage);
}

// Sync with server
async function syncWithServer() {
  // Prevent multiple syncs running at the same time
  if (isSyncing) return;
  isSyncing = true;

  const token = localStorage.getItem("token");
  if (!token) {
    isSyncing = false;
    return;
  }

  try {
    // Get stored values
    const baseGameYears = parseFloat(localStorage.getItem("gameYears") || "0");
    const lastSyncTime = parseInt(
      localStorage.getItem("lastSyncTime") || Date.now()
    );

    // Calculate seconds elapsed since last sync
    const secondsElapsed = (Date.now() - lastSyncTime) / 1000;

    // Calculate current game years
    const additionalYears = secondsElapsed * 2.777777778;
    const currentGameYears = baseGameYears + additionalYears;

    // Update on server
    const response = await fetch("/api/game-time", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameYears: currentGameYears }),
    });

    if (response.ok) {
      // Update localStorage after successful sync
      localStorage.setItem("gameYears", currentGameYears.toString());
      localStorage.setItem("lastSyncTime", Date.now().toString());
      console.log("Synced game time with server:", currentGameYears);
    } else {
      console.error("Failed to sync with server:", response.status);
    }
  } catch (error) {
    console.error("Error syncing with server:", error);
  } finally {
    isSyncing = false;
  }
}

// Handle page navigation
window.addEventListener("beforeunload", function () {
  // Sync before navigating away
  syncWithServer();
});

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded - initializing time counter");
  setTimeout(initializeTimeCounter, 500);

  // Set up logout handler
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      // Sync before logout
      syncWithServer();
    });
  }
});

// Expose functions for testing
window.debugTimeCounter = {
  init: initializeTimeCounter,
  sync: syncWithServer,
  getState: () => ({
    gameYears: parseFloat(localStorage.getItem("gameYears") || "0"),
    lastSyncTime: parseInt(localStorage.getItem("lastSyncTime") || Date.now()),
  }),
};
