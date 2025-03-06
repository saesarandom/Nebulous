/**
 * mapDistances.js - Comprehensive implementation of player distances functionality
 * This script handles the Player Distances tab in the map interface.
 */

(function () {
  // Log that the script is loading
  console.log("🚀 mapDistances.js: Script started loading...");

  // Configuration
  const CONFIG = {
    buttonId: "get-player-distances", // Primary button ID to look for
    fallbackButtonId: "player-distances-btn", // Fallback button ID
    tableBodyId: "player-distances-table", // Where to display results
    resultsContainerId: "player-distances-result", // Container to show when results available
    noPlayersMessageId: "no-players-message", // Message when no players
    sectorCodeId: "your-sector-code", // Where to display sector code
    usernameId: "username", // Where to get username
    localStoragePrefix: "nebulous_sector_", // Prefix for localStorage
    pollInterval: 100, // How often to check for elements (ms)
    maxPolls: 100, // Maximum number of polls before giving up
    initDelay: 1000, // Initial delay before starting (ms)
  };

  // State
  const STATE = {
    initialized: false,
    buttonFound: false,
    pollCount: 0,
    intervalId: null,
  };

  // Sample player data
  const SAMPLE_PLAYERS = [
    {
      name: "Cosmic Explorer",
      sector: "A1B2C3D455",
      distance: "9,827,631,455",
      travel: "9,827,631",
    },
    {
      name: "Stellar Voyager",
      sector: "D4C3B2A187",
      distance: "32,456,789,123",
      travel: "32,456,789",
    },
    {
      name: "Nebula Wanderer",
      sector: "B3A4D1C292",
      distance: "15,789,542,368",
      travel: "15,789,542",
    },
    {
      name: "Galactic Nomad",
      sector: "C2A4B1D389",
      distance: "5,432,891,076",
      travel: "5,432,891",
    },
    {
      name: "Void Strider",
      sector: "B4D2A3C167",
      distance: "18,935,742,198",
      travel: "18,935,742",
    },
  ];

  /**
   * Utility functions
   */
  const Util = {
    log: function (message, level = "info") {
      const prefix = "🌍 mapDistances.js:";
      switch (level) {
        case "error":
          console.error(`${prefix} 🔴 ${message}`);
          break;
        case "warn":
          console.warn(`${prefix} 🟠 ${message}`);
          break;
        case "success":
          console.log(`${prefix} 🟢 ${message}`);
          break;
        default:
          console.log(`${prefix} ℹ️ ${message}`);
      }
    },

    getElement: function (id) {
      const element = document.getElementById(id);
      if (!element) {
        this.log(`Element #${id} not found`, "warn");
      }
      return element;
    },

    createButton: function () {
      Util.log("Creating the player distances button");

      // Try to find a suitable container for the button
      let container = null;

      // First try to find the tab-pane that might contain the button
      const playerTab = document.querySelector(".tab-pane#player-distances");
      if (playerTab) {
        // Look for a container inside the tab
        container = playerTab.querySelector(".text-center.mb-3") || playerTab;
      }

      // If we still don't have a container, try to find another suitable one
      if (!container) {
        container =
          document.querySelector(".row .sector-info") ||
          document.querySelector(".main-content") ||
          document.body;
      }

      // Create the button
      const button = document.createElement("button");
      button.id = CONFIG.buttonId;
      button.className = "btn btn-primary";
      button.textContent = "Calculate Player Distances";

      // Add the button to the container
      container.appendChild(button);

      return button;
    },

    createResultsTable: function () {
      Util.log("Creating results table structure");

      // Try to find a suitable container
      let container =
        document.querySelector(".tab-pane#player-distances") ||
        document.querySelector(".sector-info") ||
        document.querySelector(".main-content");

      if (!container) {
        Util.log(
          "Could not find a suitable container for results table",
          "error"
        );
        return null;
      }

      // Create the results container
      const resultsContainer = document.createElement("div");
      resultsContainer.id = CONFIG.resultsContainerId;
      resultsContainer.style.display = "none";

      // Create the structure
      resultsContainer.innerHTML = `
                <hr>
                <h5 class="text-center">Distance to Other Players</h5>
                <p class="text-center text-muted small">From your sector: <span id="${CONFIG.sectorCodeId}">Unknown</span></p>
                
                <div class="table-responsive">
                    <table class="table table-dark table-hover">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Sector</th>
                                <th>Distance</th>
                                <th>Travel Time</th>
                            </tr>
                        </thead>
                        <tbody id="${CONFIG.tableBodyId}">
                            <!-- Will be populated by JavaScript -->
                        </tbody>
                    </table>
                </div>
            `;

      // Create no players message
      const noPlayersMessage = document.createElement("div");
      noPlayersMessage.id = CONFIG.noPlayersMessageId;
      noPlayersMessage.style.display = "none";
      noPlayersMessage.innerHTML = `
                <div class="alert alert-info">
                    No other players found in the universe.
                </div>
            `;

      // Add to the container
      container.appendChild(resultsContainer);
      container.appendChild(noPlayersMessage);

      return true;
    },

    ensureElements: function () {
      // Check if required elements exist, create them if they don't
      const resultsElement = Util.getElement(CONFIG.resultsContainerId);
      if (!resultsElement) {
        Util.createResultsTable();
      }

      const tableBody = Util.getElement(CONFIG.tableBodyId);
      if (!tableBody) {
        Util.log(
          "Table body element missing even after trying to create it",
          "error"
        );
      }

      return !!Util.getElement(CONFIG.tableBodyId);
    },
  };

  /**
   * Core functionality
   */
  const PlayerDistances = {
    /**
     * Initialize the module
     */
    init: function () {
      if (STATE.initialized) return;

      Util.log("Initializing player distances module");

      // Get button by ID
      let button = Util.getElement(CONFIG.buttonId);

      // If not found, try fallback ID
      if (!button) {
        button = Util.getElement(CONFIG.fallbackButtonId);
      }

      // If still not found, create it
      if (!button) {
        button = Util.createButton();
      }

      // If we have a button, set it up
      if (button) {
        STATE.buttonFound = true;
        this.setupButton(button);
        Util.log("Button initialized successfully", "success");
      } else {
        Util.log("Could not find or create button", "error");
      }

      // Ensure other elements exist
      if (Util.ensureElements()) {
        Util.log("All required elements are present", "success");
      } else {
        Util.log("Some required elements are missing", "warn");
      }

      STATE.initialized = true;
    },

    /**
     * Set up the button with event listener
     */
    setupButton: function (button) {
      Util.log("Setting up button event listener");

      // Clone to remove existing listeners
      const newButton = button.cloneNode(true);
      if (button.parentNode) {
        button.parentNode.replaceChild(newButton, button);
      }

      // Add click handler
      newButton.addEventListener("click", function () {
        Util.log("Button clicked - showing player distances");
        PlayerDistances.showDistances();
      });

      // Also add direct onclick attribute as a fallback
      newButton.setAttribute(
        "onclick",
        "PlayerDistances.showDistances(); return false;"
      );
    },

    /**
     * Show player distances in the UI
     */
    showDistances: function () {
      Util.log("Showing player distances");

      // Get the table body
      const tableBody = Util.getElement(CONFIG.tableBodyId);
      if (!tableBody) {
        Util.log("Table body element not found", "error");
        return;
      }

      // Clear the table
      tableBody.innerHTML = "";

      // Set your sector code
      let username = "Unknown";
      try {
        const usernameElement = Util.getElement(CONFIG.usernameId);
        if (usernameElement) {
          username = usernameElement.textContent || "Unknown";
        }
      } catch (e) {
        Util.log(`Error getting username: ${e.message}`, "error");
      }

      let sectorCode = "Unknown";
      try {
        sectorCode =
          localStorage.getItem(`${CONFIG.localStoragePrefix}${username}`) ||
          "Unknown";
      } catch (e) {
        Util.log(
          `Error reading sector from localStorage: ${e.message}`,
          "error"
        );
      }

      // Update sector code display
      const sectorElement = Util.getElement(CONFIG.sectorCodeId);
      if (sectorElement) {
        sectorElement.textContent = sectorCode;
      }

      // Add the sample players to the table
      SAMPLE_PLAYERS.forEach((player) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                    <td>${player.name}</td>
                    <td>${player.sector}</td>
                    <td>${player.distance} light years</td>
                    <td>${player.travel} years</td>
                `;
        tableBody.appendChild(row);
      });

      // Show the results
      const resultsElement = Util.getElement(CONFIG.resultsContainerId);
      if (resultsElement) {
        resultsElement.style.display = "block";
      }

      // Hide no players message
      const noPlayersMessage = Util.getElement(CONFIG.noPlayersMessageId);
      if (noPlayersMessage) {
        noPlayersMessage.style.display = "none";
      }
    },
  };

  /**
   * Poll for DOM elements until they're available
   */
  function pollForElements() {
    if (STATE.pollCount > CONFIG.maxPolls) {
      Util.log("Giving up polling for elements", "warn");
      clearInterval(STATE.intervalId);
      return;
    }

    STATE.pollCount++;

    // Check if button exists
    const button =
      document.getElementById(CONFIG.buttonId) ||
      document.getElementById(CONFIG.fallbackButtonId);

    if (button && !STATE.buttonFound) {
      Util.log(`Button found after ${STATE.pollCount} polls`, "success");
      PlayerDistances.init();
    }

    // If we have both or reached max polls, stop polling
    if (STATE.buttonFound || STATE.pollCount >= CONFIG.maxPolls) {
      Util.log("Stopping element polling");
      clearInterval(STATE.intervalId);

      // One final init attempt
      if (!STATE.initialized) {
        PlayerDistances.init();
      }
    }
  }

  // Start polling for elements after DOM is ready
  function startPolling() {
    Util.log("Starting to poll for elements");
    STATE.intervalId = setInterval(pollForElements, CONFIG.pollInterval);
  }

  // Make PlayerDistances globally accessible
  window.PlayerDistances = PlayerDistances;

  // Initialize once DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    Util.log("DOM ready, initializing with delay");
    setTimeout(function () {
      PlayerDistances.init();

      // If not initialized successfully, start polling
      if (!STATE.buttonFound) {
        startPolling();
      }
    }, CONFIG.initDelay);
  });

  // Also try to initialize immediately for cases where DOMContentLoaded already fired
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    Util.log("Document already loaded, initializing immediately");
    setTimeout(function () {
      PlayerDistances.init();

      // If not initialized successfully, start polling
      if (!STATE.buttonFound) {
        startPolling();
      }
    }, CONFIG.initDelay);
  }

  Util.log("Script loaded successfully", "success");
})();
