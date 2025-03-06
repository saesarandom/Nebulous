/**
 * buildings.js - Building management for Nebulous with database synchronization
 */

// Building Manager
const BuildingManager = {
  // Building definitions
  buildings: {
    windTurbine: {
      id: "windTurbine",
      name: "Větrná turbína",
      icon: "icon-wind-turbine",
      description: "Generates electricity from wind energy.",
      blueprintCost: {
        wood: 1000,
      },
      buildCost: {
        wood: 10,
        stone: 5,
      },
      maxCount: 999999, // Effectively no limit
    },
    thermalTower: {
      id: "thermalTower",
      name: "Tepla elektrická věž",
      icon: "icon-thermal-tower",
      description: "Produces electricity from thermal energy.",
      blueprintCost: {
        wood: 1000,
        stone: 1000,
      },
      buildCost: {
        stone: 15,
        iron: 5,
      },
      maxCount: 999999, // Effectively no limit
    },
    miningMachine: {
      id: "miningMachine",
      name: "Těžební stroj",
      icon: "icon-mining-machine",
      description: "Automated machine for resource extraction.",
      blueprintCost: {
        stone: 2000,
      },
      buildCost: {
        iron: 20,
      },
      maxCount: 999999, // Effectively no limit
    },
    silo: {
      id: "silo",
      name: "Silo",
      icon: "icon-silo",
      description: "Storage for resources and materials.",
      blueprintCost: {
        stone: 2000,
        iron: 2000,
      },
      buildCost: {
        copper: 25,
      },
      maxCount: 999999, // Effectively no limit
    },
    decomposer: {
      id: "decomposer",
      name: "Rozkládací stroj",
      icon: "icon-decomposer",
      description: "Breaks down complex materials into raw resources.",
      blueprintCost: {
        copper: 3000,
        wood: 2000,
      },
      buildCost: {
        wood: 10,
        iron: 10,
        copper: 20,
      },
      maxCount: 999999, // Effectively no limit
    },
    waterPump: {
      id: "waterPump",
      name: "Vodní pumpa",
      icon: "icon-water-pump",
      description: "Extracts and purifies water from underground sources.",
      blueprintCost: {
        iron: 1000,
        copper: 4000,
      },
      buildCost: {
        wood: 15,
        copper: 15,
        iron: 15,
        coal: 15,
      },
      maxCount: 999999, // Effectively no limit
    },
    syntheticFurnace: {
      id: "syntheticFurnace",
      name: "Syntetická pec",
      icon: "icon-synthetic-furnace",
      description: "Creates synthetic materials at high temperatures.",
      blueprintCost: {
        coal: 5000,
      },
      buildCost: {
        stone: 30,
        coal: 25,
        copper: 25,
      },
      maxCount: 999999, // Effectively no limit
    },
    casino: {
      id: "casino",
      name: "Casino",
      icon: "icon-casino",
      description: "Entertainment facility for your planet inhabitants.",
      blueprintCost: {
        wood: 10000,
        stone: 10000,
        iron: 10000,
        copper: 10000,
        coal: 10000,
      },
      buildCost: {},
      maxCount: 1, // Only one casino allowed
    },
  },

  // State variables
  playerBuildings: {},
  blueprints: {},
  initialized: false,
  resourceManager: null,
  username: null,
  lastSyncTime: 0,
  dbSyncInterval: 30 * 1000, // 30 seconds (more frequent for testing)
  isSyncing: false,
  offlineMode: false,

  // Initialize building system
  async initialize() {
    if (this.initialized) return;

    try {
      console.log("Initializing building manager...");

      // Get username
      const usernameElement = document.getElementById("username");
      if (usernameElement && usernameElement.textContent !== "User") {
        this.username = usernameElement.textContent;
        console.log(`Username found: ${this.username}`);
      } else {
        console.error("Username not found, cannot initialize buildings");
        return;
      }

      // Wait for resource manager to initialize first
      await this.waitForResourceManager();

      // Try to load buildings from database first
      const dbLoaded = await this.loadBuildingsFromDatabase();

      // If database load fails, fall back to localStorage
      if (!dbLoaded) {
        console.log(
          "Failed to load from database, falling back to localStorage"
        );
        this.loadBuildingsFromStorage();
      }

      // Create display
      this.createBuildingsGrid();

      // Update resources summary
      this.updateResourcesSummary();

      // Start periodic resource updates
      setInterval(() => this.updateResourcesSummary(), 2000);

      // Set up event handlers
      this.setupEventHandlers();

      // Set up periodic database sync
      setInterval(() => this.syncBuildingsToDatabase(), this.dbSyncInterval);

      // Force a sync after initialization to ensure data is stored
      setTimeout(() => this.syncBuildingsToDatabase(true), 5000);

      console.log("Building manager initialized successfully");
      this.initialized = true;
    } catch (error) {
      console.error("Error initializing building manager:", error);
    }
  },

  // Wait for resource manager to be available
  async waitForResourceManager() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (
          window.SimpleResourceManager &&
          window.SimpleResourceManager.resources
        ) {
          this.resourceManager = window.SimpleResourceManager;
          clearInterval(checkInterval);
          console.log("Resource manager found");
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        console.error("Timeout waiting for resource manager");
        resolve();
      }, 10000);
    });
  },

  // Load buildings from database
  async loadBuildingsFromDatabase() {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found, cannot load buildings from database");
        return false;
      }

      console.log("Attempting to load buildings from database...");

      const response = await fetch("/api/buildings", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle not found - might be first time for this user
      if (response.status === 404) {
        console.log(
          "No buildings found in database, using default empty state"
        );
        return false;
      }

      // Handle server errors
      if (!response.ok) {
        console.error(`Server error loading buildings: ${response.status}`);
        this.offlineMode = true;
        return false;
      }

      // Handle successful response
      const data = await response.json();
      console.log("Database response:", data);

      if (data.buildings) {
        // Database structure might be { buildings: {...}, blueprints: {...} }
        if (data.buildings.buildings && data.buildings.blueprints) {
          console.log("Found nested buildings data structure");
          this.playerBuildings = data.buildings.buildings;
          this.blueprints = data.buildings.blueprints;
        } else {
          console.log("Found direct buildings data (old format?)");
          // Or it might just be the buildings object directly
          this.playerBuildings = data.buildings;
        }

        this.lastSyncTime = Date.now();
        console.log(
          "Buildings loaded from database successfully:",
          this.playerBuildings
        );
        console.log("Blueprints loaded from database:", this.blueprints);
        return true;
      } else {
        console.warn("No buildings data in server response");
        return false;
      }
    } catch (error) {
      console.error("Error loading buildings from database:", error);
      this.offlineMode = true;
      return false;
    }
  },

  // Load buildings from localStorage as backup
  loadBuildingsFromStorage() {
    try {
      const storedBuildings = localStorage.getItem(
        `nebulous_${this.username}_buildings`
      );
      const storedBlueprints = localStorage.getItem(
        `nebulous_${this.username}_blueprints`
      );

      if (storedBuildings) {
        this.playerBuildings = JSON.parse(storedBuildings);
      } else {
        this.playerBuildings = {};
      }

      if (storedBlueprints) {
        this.blueprints = JSON.parse(storedBlueprints);
      } else {
        this.blueprints = {};
      }

      console.log("Loaded buildings from localStorage:", this.playerBuildings);
      console.log("Loaded blueprints from localStorage:", this.blueprints);
    } catch (error) {
      console.error("Error loading buildings from localStorage:", error);
      this.playerBuildings = {};
      this.blueprints = {};
    }
  },

  // Save buildings to localStorage
  saveBuildingsToStorage() {
    try {
      localStorage.setItem(
        `nebulous_${this.username}_buildings`,
        JSON.stringify(this.playerBuildings)
      );
      localStorage.setItem(
        `nebulous_${this.username}_blueprints`,
        JSON.stringify(this.blueprints)
      );
      console.log("Buildings saved to localStorage");
    } catch (error) {
      console.error("Error saving buildings to localStorage:", error);
    }
  },

  // Sync buildings to database
  async syncBuildingsToDatabase(forceSync = false) {
    // Don't sync if already syncing or in offline mode (unless forced)
    if ((this.isSyncing || this.offlineMode) && !forceSync) return;

    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;

    // Only sync at reasonable intervals (unless forced)
    if (timeSinceLastSync < this.dbSyncInterval && !forceSync) {
      return;
    }

    this.isSyncing = true;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        this.isSyncing = false;
        return;
      }

      console.log("Syncing buildings to database...");
      console.log("Data to sync:", {
        buildings: this.playerBuildings,
        blueprints: this.blueprints,
      });

      const response = await fetch("/api/buildings/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          buildings: this.playerBuildings,
          blueprints: this.blueprints,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Sync response:", data);

        this.lastSyncTime = now;
        console.log("Buildings synced to database successfully");

        // Turn off offline mode if we were in it
        if (this.offlineMode) {
          this.offlineMode = false;
          console.log("Reconnected to database, offline mode disabled");
        }
      } else {
        console.error(
          `Failed to sync buildings to database: ${response.status}`
        );
        const errorText = await response.text();
        console.error("Error details:", errorText);
        this.offlineMode = true;
      }
    } catch (error) {
      console.error("Error syncing buildings to database:", error);
      this.offlineMode = true;
    } finally {
      this.isSyncing = false;
    }
  },

  // Force sync to database (for logout or page unload)
  forceSyncToDatabase() {
    try {
      const token = localStorage.getItem("token");
      if (!token || this.offlineMode) return;

      const data = {
        buildings: this.playerBuildings,
        blueprints: this.blueprints,
      };

      console.log("Force syncing data before unload:", data);

      // First try fetch with keepalive
      fetch("/api/buildings/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        keepalive: true,
      }).catch((err) => console.error("Fetch with keepalive failed:", err));

      // Fallback to sendBeacon
      try {
        const blob = new Blob([JSON.stringify(data)], {
          type: "application/json",
        });

        // Add authorization header to the beacon
        const beaconSuccess = navigator.sendBeacon("/api/buildings/sync", blob);
        console.log(
          "Forced buildings database sync using sendBeacon:",
          beaconSuccess
        );
      } catch (beaconError) {
        console.error("SendBeacon failed:", beaconError);
      }
    } catch (error) {
      console.error("Error during forced buildings database sync:", error);
    }
  },

  // Create buildings grid in the UI
  createBuildingsGrid() {
    const gridContainer = document.getElementById("building-grid");
    if (!gridContainer) {
      console.error("Building grid container not found");
      return;
    }

    // Clear the container
    gridContainer.innerHTML = "";

    // Add building cards
    Object.values(this.buildings).forEach((building) => {
      const card = this.createBuildingCard(building);
      gridContainer.appendChild(card);
    });
  },

  // Create a building card element
  createBuildingCard(building) {
    const card = document.createElement("div");
    card.className = "building-card";
    card.id = `building-${building.id}`;

    // Get building count and blueprint status
    const buildingCount = this.playerBuildings[building.id] || 0;
    const hasBlueprint = this.blueprints[building.id] || false;

    // Determine if player can afford the costs
    const canAffordBlueprint = this.canAffordCost(building.blueprintCost);
    const canAffordBuilding =
      hasBlueprint && this.canAffordCost(building.buildCost);
    const maxedOut =
      building.id === "casino" && buildingCount >= building.maxCount;

    // Create the card content
    card.innerHTML = `
        <div class="building-image">
          <span class="${building.icon} building-icon"></span>
        </div>
        <div class="building-name">${building.name}</div>
        <div class="building-description">${building.description}</div>
        
        ${
          buildingCount > 0
            ? `<div class="building-level">Count: ${buildingCount}</div>`
            : ""
        }
        
        <div class="building-requirements">
          ${
            hasBlueprint
              ? `<div class="blueprint-owned">Blueprint owned</div>
             <strong>Building costs:</strong>
             <div class="resource-cost" id="${building.id}-build-cost">
               ${this.formatResourceCost(building.buildCost, canAffordBuilding)}
             </div>`
              : `<strong>Blueprint costs:</strong>
             <div class="resource-cost" id="${building.id}-blueprint-cost">
               ${this.formatResourceCost(
                 building.blueprintCost,
                 canAffordBlueprint
               )}
             </div>`
          }
        </div>
        
        <div class="building-status">
          <div class="building-count">Built: ${buildingCount}${
      building.id === "casino" ? "/1" : ""
    }</div>
        </div>
        
        ${
          hasBlueprint
            ? `<button class="btn btn-sm build-btn ${
                !canAffordBuilding || maxedOut ? "disabled-btn" : ""
              }" 
                  data-building-id="${building.id}" 
                  ${!canAffordBuilding || maxedOut ? "disabled" : ""}>
             Build
           </button>`
            : `<button class="btn btn-sm blueprint-btn ${
                !canAffordBlueprint ? "disabled-btn" : ""
              }" 
                  data-building-id="${building.id}" 
                  ${!canAffordBlueprint ? "disabled" : ""}>
             Buy Blueprint
           </button>`
        }
      `;

    return card;
  },

  // Format resource cost for display
  formatResourceCost(costs, canAfford) {
    if (!costs || Object.keys(costs).length === 0) {
      return '<span class="resource-item sufficient">Free!</span>';
    }

    return Object.entries(costs)
      .map(([resource, amount]) => {
        const currentAmount = this.resourceManager?.resources[resource] || 0;
        const sufficient = currentAmount >= amount;

        return `<span class="resource-item ${
          sufficient ? "sufficient" : "insufficient"
        }">
                  ${resource}: ${amount}
                </span>`;
      })
      .join("");
  },

  // Check if player can afford a cost
  canAffordCost(costs) {
    if (!costs || Object.keys(costs).length === 0) return true;
    if (!this.resourceManager) return false;

    return Object.entries(costs).every(([resource, amount]) => {
      const currentAmount = this.resourceManager.resources[resource] || 0;
      return currentAmount >= amount;
    });
  },

  // Update resource summary display
  updateResourcesSummary() {
    const container = document.getElementById("resources-summary");
    if (!container || !this.resourceManager) return;

    // Clear existing content
    container.innerHTML = "";

    // Get top 5 resources
    const mainResources = ["wood", "stone", "iron", "copper", "coal"];

    // Create resource items
    mainResources.forEach((resource) => {
      const amount = Math.floor(this.resourceManager.resources[resource] || 0);

      const resourceItem = document.createElement("div");
      resourceItem.className = "resource-summary-item";
      resourceItem.innerHTML = `
          <div class="resource-summary-name">${
            resource.charAt(0).toUpperCase() + resource.slice(1)
          }:</div>
          <div class="resource-summary-amount">${amount.toLocaleString()}</div>
        `;

      container.appendChild(resourceItem);
    });

    // Update all building cards' cost status
    this.updateAllBuildingCosts();
  },

  // Update cost indicators on all building cards
  updateAllBuildingCosts() {
    Object.values(this.buildings).forEach((building) => {
      const blueprintCostElement = document.getElementById(
        `${building.id}-blueprint-cost`
      );
      const buildCostElement = document.getElementById(
        `${building.id}-build-cost`
      );

      // Update blueprint cost indicator if element exists
      if (blueprintCostElement) {
        const canAffordBlueprint = this.canAffordCost(building.blueprintCost);
        blueprintCostElement.innerHTML = this.formatResourceCost(
          building.blueprintCost,
          canAffordBlueprint
        );

        // Update button state
        const blueprintBtn = document.querySelector(
          `.blueprint-btn[data-building-id="${building.id}"]`
        );
        if (blueprintBtn) {
          if (canAffordBlueprint) {
            blueprintBtn.classList.remove("disabled-btn");
            blueprintBtn.disabled = false;
          } else {
            blueprintBtn.classList.add("disabled-btn");
            blueprintBtn.disabled = true;
          }
        }
      }

      // Update build cost indicator if element exists
      if (buildCostElement) {
        const hasBlueprint = this.blueprints[building.id] || false;
        const buildingCount = this.playerBuildings[building.id] || 0;
        const maxedOut =
          building.id === "casino" && buildingCount >= building.maxCount;
        const canAffordBuilding =
          hasBlueprint && this.canAffordCost(building.buildCost);

        buildCostElement.innerHTML = this.formatResourceCost(
          building.buildCost,
          canAffordBuilding
        );

        // Update button state
        const buildBtn = document.querySelector(
          `.build-btn[data-building-id="${building.id}"]`
        );
        if (buildBtn) {
          if (canAffordBuilding && !maxedOut) {
            buildBtn.classList.remove("disabled-btn");
            buildBtn.disabled = false;
          } else {
            buildBtn.classList.add("disabled-btn");
            buildBtn.disabled = true;
          }
        }
      }
    });
  },

  // Set up event handlers
  setupEventHandlers() {
    document.addEventListener("click", (event) => {
      // Handle blueprint button clicks
      if (event.target.classList.contains("blueprint-btn")) {
        const buildingId = event.target.getAttribute("data-building-id");
        if (buildingId) {
          this.buyBlueprint(buildingId);
        }
      }

      // Handle build button clicks
      if (event.target.classList.contains("build-btn")) {
        const buildingId = event.target.getAttribute("data-building-id");
        if (buildingId) {
          this.buildBuilding(buildingId);
        }
      }
    });

    // Save buildings when leaving the page
    window.addEventListener("beforeunload", (event) => {
      // Save to localStorage
      this.saveBuildingsToStorage();

      // Sync to database
      this.forceSyncToDatabase();

      // For older browsers, return a string to show confirmation dialog
      event.returnValue = "";
    });

    // Save on logout
    document.addEventListener("nebulous-logout", () => {
      console.log("Logout detected, saving buildings");
      this.saveBuildingsToStorage();
      this.forceSyncToDatabase();
    });

    // Debug button
    this.addDebugButton();
  },

  // Add a debug button to force sync
  addDebugButton() {
    setTimeout(() => {
      const container = document.getElementById("building-grid");
      if (!container) return;

      // Create debug controls section
      const debugDiv = document.createElement("div");
      debugDiv.className = "debug-controls";
      debugDiv.style.marginTop = "20px";
      debugDiv.style.padding = "10px";
      debugDiv.style.backgroundColor = "rgba(0,0,0,0.3)";
      debugDiv.style.borderRadius = "5px";

      debugDiv.innerHTML = `
        <h4>Debug Controls</h4>
        <button id="force-db-sync" class="btn btn-sm btn-warning">Force DB Sync</button>
        <button id="check-db-state" class="btn btn-sm btn-info ms-2">Check DB State</button>
        <button id="reset-buildings" class="btn btn-sm btn-danger ms-2">Reset Buildings</button>
        <div id="debug-output" class="mt-2" style="font-family: monospace; font-size: 12px;"></div>
      `;

      container.appendChild(debugDiv);

      // Add event listeners to debug buttons
      document.getElementById("force-db-sync").addEventListener("click", () => {
        const debugOutput = document.getElementById("debug-output");
        debugOutput.textContent = "Forcing database sync...";

        this.syncBuildingsToDatabase(true)
          .then(() => {
            debugOutput.textContent = `Sync completed at ${new Date().toLocaleTimeString()}`;
          })
          .catch((error) => {
            debugOutput.textContent = `Sync error: ${error.message}`;
          });
      });

      document
        .getElementById("check-db-state")
        .addEventListener("click", async () => {
          const debugOutput = document.getElementById("debug-output");
          debugOutput.textContent = "Checking database state...";

          try {
            const token = localStorage.getItem("token");
            const response = await fetch("/api/debug/buildings", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            const data = await response.json();

            debugOutput.innerHTML = `
            DB State at ${new Date().toLocaleTimeString()}:<br>
            ${JSON.stringify(data, null, 2)
              .substring(0, 500)
              .replace(/\n/g, "<br>")}...
          `;
          } catch (error) {
            debugOutput.textContent = `Error checking DB: ${error.message}`;
          }
        });

      document
        .getElementById("reset-buildings")
        .addEventListener("click", async () => {
          if (
            confirm(
              "Are you sure you want to reset all buildings? This cannot be undone."
            )
          ) {
            const debugOutput = document.getElementById("debug-output");
            debugOutput.textContent = "Resetting buildings...";

            // Reset local state
            this.playerBuildings = {};
            this.blueprints = {};

            // Save to localStorage
            this.saveBuildingsToStorage();

            // Sync to database
            await this.syncBuildingsToDatabase(true);

            // Refresh display
            this.createBuildingsGrid();

            debugOutput.textContent = "Buildings reset successfully";
          }
        });
    }, 1000);
  },

  // Buy a building blueprint
  buyBlueprint(buildingId) {
    const building = this.buildings[buildingId];
    if (!building) {
      console.error(`Building ${buildingId} not found`);
      return;
    }

    // Check if player already has the blueprint
    if (this.blueprints[buildingId]) {
      this.showMessage("You already own this blueprint.", "error");
      return;
    }

    // Check if player can afford the blueprint
    if (!this.canAffordCost(building.blueprintCost)) {
      this.showMessage("You cannot afford this blueprint.", "error");
      return;
    }

    // Subtract resources
    this.subtractResources(building.blueprintCost);

    // Add blueprint to player's collection
    this.blueprints[buildingId] = true;

    // Save to localStorage
    this.saveBuildingsToStorage();

    // Immediately sync to database to prevent loss on page reload
    this.syncBuildingsToDatabase(true);

    // Show success message
    this.showMessage(
      `You've acquired the blueprint for ${building.name}!`,
      "success"
    );

    // Update the display
    this.createBuildingsGrid();
  },

  // Build a building
  buildBuilding(buildingId) {
    const building = this.buildings[buildingId];
    if (!building) {
      console.error(`Building ${buildingId} not found`);
      return;
    }

    // Check if player has the blueprint
    if (!this.blueprints[buildingId]) {
      this.showMessage("You need to buy the blueprint first.", "error");
      return;
    }

    // Check if player can afford to build
    if (!this.canAffordCost(building.buildCost)) {
      this.showMessage("You cannot afford to build this.", "error");
      return;
    }

    // Check if player has reached max count for casino
    if (buildingId === "casino") {
      const currentCount = this.playerBuildings[buildingId] || 0;
      if (currentCount >= building.maxCount) {
        this.showMessage(
          `You've reached the maximum number of Casinos.`,
          "error"
        );
        return;
      }
    }

    // Subtract resources
    this.subtractResources(building.buildCost);

    // Add building to player's collection
    this.playerBuildings[buildingId] =
      (this.playerBuildings[buildingId] || 0) + 1;

    // Save to localStorage
    this.saveBuildingsToStorage();

    // Immediately sync to database to prevent loss on page reload
    this.syncBuildingsToDatabase(true);

    // Show success message
    this.showMessage(`You've built a ${building.name}!`, "success");

    // Update the display with animation
    const buildingCard = document.getElementById(`building-${buildingId}`);
    if (buildingCard) {
      buildingCard.classList.add("building-constructed");
      setTimeout(
        () => buildingCard.classList.remove("building-constructed"),
        1000
      );
    }

    // Update the entire grid to refresh building counts and status
    this.createBuildingsGrid();
  },

  // Subtract resources from player's inventory
  subtractResources(costs) {
    if (!costs || !this.resourceManager) return;

    Object.entries(costs).forEach(([resource, amount]) => {
      if (this.resourceManager.resources[resource]) {
        this.resourceManager.resources[resource] -= amount;
      }
    });

    // Update resources display
    this.updateResourcesSummary();
  },

  // Show a message to the player
  showMessage(message, type = "success") {
    const elementId = type === "error" ? "error-message" : "success-message";
    const messageElement = document.getElementById(elementId);

    if (messageElement) {
      messageElement.textContent = message;
      messageElement.style.display = "block";

      // Hide after 3 seconds
      setTimeout(() => {
        messageElement.style.display = "none";
      }, 3000);
    }
  },
};

// Initialize when the DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded - initializing building manager");

  // Initialize after a short delay to ensure resources are loaded
  setTimeout(() => {
    BuildingManager.initialize();
  }, 800);
});

// Also add a synchronous unload handler to ensure data is saved
window.addEventListener("unload", function () {
  // Check if BuildingManager is initialized
  if (window.BuildingManager && window.BuildingManager.initialized) {
    try {
      // Create a synchronous XMLHttpRequest (deprecated but useful for unload)
      const token = localStorage.getItem("token");
      if (token) {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/buildings/sync", false); // Synchronous request
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(
          JSON.stringify({
            buildings: BuildingManager.playerBuildings,
            blueprints: BuildingManager.blueprints,
          })
        );
      }
    } catch (e) {
      console.error("Error in unload handler:", e);
    }
  }
});

// Expose for debugging
window.BuildingManager = BuildingManager;
