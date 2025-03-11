/**
 * resources.js - Resource management for Nebulous with database saving
 */

// Resource management system with database synchronization
const SimpleResourceManager = {
  // Resource data
  resourceTypes: [
    "wood",
    "stone",
    "iron",
    "copper",
    "coal",
    "platina",
    "palladium",
    "iridium",
    "rhodium",
    "osmium",
    "ruthenium",
    "rhenium",
    "galium",
    "terbium",
    "plasmatron",
    "chromitium",
    "neptunium",
    "xenarium",
    "protorium",
  ],
  resourceRates: {
    wood: { min: 5, max: 15, chance: 1 }, // 100%
    stone: { min: 4, max: 13, chance: 0.95 }, // 95%
    iron: { min: 3, max: 10, chance: 0.9 }, // 91%
    copper: { min: 2, max: 9, chance: 0.85 }, // 90%
    coal: { min: 1, max: 7, chance: 0.8 }, // 85%
    platina: { min: 1, max: 4, chance: 0.75 },
    palladium: { min: 1, max: 3, chance: 0.7 },
    iridium: { min: 1, max: 2, chance: 0.6 },
    rhodium: { min: 1, max: 1, chance: 0.5 },
    osmium: { min: 1, max: 1, chance: 0.4 },
    ruthenium: { min: 1, max: 1, chance: 0.3 },
    rhenium: { min: 1, max: 1, chance: 0.2 },
    galium: { min: 1, max: 1, chance: 0.1 },
    terbium: { min: 1, max: 1, chance: 1 / 20 },
    plasmatron: { min: 0.7, max: 1, chance: 1 / 200 },
    chromitium: { min: 0.5, max: 0.8, chance: 1 / 300 },
    neptunium: { min: 0.2, max: 0.6, chance: 1 / 1000 },
    xenarium: { min: 0.1, max: 0.4, chance: 1 / 10000 },
    protorium: { min: 0.05, max: 0.2, chance: 1 / 100000 },
  },
  resources: {},
  lastSyncTime: 0,
  lastDbSyncTime: 0,
  dbSyncInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
  intervalId: null,
  initialized: false,
  username: null,
  isSyncing: false,
  offlineMode: false,

  // Initialize system
  initialize() {
    // Get the current username first
    this.fetchUsername()
      .then(() => {
        console.log(`Initializing resources for user: ${this.username}`);
        // First try to load from database
        this.loadFromDatabase()
          .then((success) => {
            if (!success) {
              // If database load fails, try localStorage as backup
              this.loadFromLocalStorage();
            }
            // Create the display and start updates
            this.createDisplay();
            this.startUpdates();
            this.setupSaveHandlers();
            this.initialized = true;
          })
          .catch((error) => {
            console.error("Error loading from database:", error);
            // Fall back to localStorage
            this.loadFromLocalStorage();
            this.createDisplay();
            this.startUpdates();
            this.setupSaveHandlers();
            this.initialized = true;
          });
      })
      .catch((error) => {
        console.error("Error initializing resource manager:", error);
      });
  },

  // Fetch the current username
  async fetchUsername() {
    try {
      // First check if username is in the UI
      const usernameElement = document.getElementById("username");
      if (
        usernameElement &&
        usernameElement.textContent &&
        usernameElement.textContent !== "User"
      ) {
        this.username = usernameElement.textContent;
        console.log(`Found username from UI: ${this.username}`);
        return;
      }

      // If not found in UI, try to get it from the token
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found, cannot identify user");
        throw new Error("No token found");
      }

      // Try to get the username from the server
      const response = await fetch("/api/user", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.username = data.username;
        console.log(`Fetched username from server: ${this.username}`);
      } else {
        console.error("Failed to fetch username from server");
        throw new Error("Failed to fetch username");
      }
    } catch (error) {
      console.error("Error fetching username:", error);
      // Use a fallback unique identifier if username can't be fetched
      this.username = `user_${Math.floor(Math.random() * 1000000)}`;
      console.log(`Using fallback username: ${this.username}`);
    }
  },

  // Load resources from database
  async loadFromDatabase() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return false;

      console.log("Attempting to load resources from database...");

      const response = await fetch("/api/resources", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle not found - might be first time for this user
      if (response.status === 404) {
        console.log(
          "No resources found in database, will initialize new resources"
        );
        this.initializeDefaultResources();
        return true;
      }

      // Handle server errors
      if (!response.ok) {
        console.error(`Server error loading resources: ${response.status}`);
        this.offlineMode = true;
        return false;
      }

      // Handle successful response
      const data = await response.json();

      if (data.resources) {
        this.resources = data.resources;
        this.lastSyncTime = Date.now();
        this.lastDbSyncTime = Date.now();

        console.log(
          "Resources loaded from database successfully:",
          this.resources
        );
        return true;
      } else {
        console.warn("No resources data in server response");
        this.initializeDefaultResources();
        return true;
      }
    } catch (error) {
      console.error("Error loading resources from database:", error);
      this.offlineMode = true;
      return false;
    }
  },

  // Initialize default resources
  initializeDefaultResources() {
    this.resourceTypes.forEach((type) => {
      this.resources[type] = 0;
    });
    this.lastSyncTime = Date.now();
    this.lastDbSyncTime = Date.now();
    console.log("Default resources initialized");
  },

  // Get resource storage keys for the current user
  getStorageKeys() {
    const userPrefix = this.username ? `${this.username}_` : "";
    return {
      resources: `nebulous_${userPrefix}resources`,
      time: `nebulous_${userPrefix}resources_time`,
      dbSync: `nebulous_${userPrefix}db_sync_time`,
    };
  },

  // Load resources from localStorage as backup
  loadFromLocalStorage() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return false;

      const keys = this.getStorageKeys();
      const savedResources = localStorage.getItem(keys.resources);
      const savedTime = localStorage.getItem(keys.time);
      const savedDbSyncTime = localStorage.getItem(keys.dbSync);

      if (savedResources && savedTime) {
        this.resources = JSON.parse(savedResources);
        this.lastSyncTime = parseInt(savedTime);
        this.lastDbSyncTime = savedDbSyncTime ? parseInt(savedDbSyncTime) : 0;

        console.log(`Loaded resources from localStorage for ${this.username}`);

        // Calculate resources gained while away
        this.calculateOfflineGains();
        return true;
      } else {
        // Initialize default resources
        this.initializeDefaultResources();
      }
    } catch (error) {
      console.error("Error loading resources from localStorage:", error);
      // Initialize default resources on error
      this.initializeDefaultResources();
    }
  },

  // Calculate resources gained while offline
  calculateOfflineGains() {
    if (!this.lastSyncTime) return;

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - this.lastSyncTime) / 1000);

    if (elapsedSeconds <= 0) return;

    console.log(`Calculating offline gains for ${elapsedSeconds} seconds`);

    // For each resource type
    this.resourceTypes.forEach((type) => {
      const rate = this.resourceRates[type];
      const avgGainPerSecond = ((rate.min + rate.max) / 2) * rate.chance;
      const totalGain = Math.floor(avgGainPerSecond * elapsedSeconds);

      // Add the offline gains
      this.resources[type] = (this.resources[type] || 0) + totalGain;

      console.log(`Added ${totalGain} ${type} from offline gains`);
    });

    this.lastSyncTime = now;
    this.saveToLocalStorage();
    this.syncToDatabase(); // Try to sync to database immediately after calculating offline gains
  },

  // Save resources to localStorage
  saveToLocalStorage() {
    if (!this.username) {
      console.error("Cannot save resources: No username set");
      return;
    }

    try {
      const keys = this.getStorageKeys();
      localStorage.setItem(keys.resources, JSON.stringify(this.resources));
      localStorage.setItem(keys.time, Date.now().toString());
      localStorage.setItem(keys.dbSync, this.lastDbSyncTime.toString());
    } catch (error) {
      console.error("Error saving resources to localStorage:", error);
    }
  },

  // Sync resources to database
  async syncToDatabase() {
    // Don't sync if we're in offline mode or already syncing
    if (this.isSyncing || this.offlineMode) return;

    const now = Date.now();
    const timeSinceLastDbSync = now - this.lastDbSyncTime;

    // Only sync at reasonable intervals unless forced
    if (timeSinceLastDbSync < this.dbSyncInterval) {
      return;
    }

    this.isSyncing = true;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        this.isSyncing = false;
        return;
      }

      console.log("Syncing resources to database...");

      const response = await fetch("/api/resources/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resources: this.resources,
          lastSync: this.lastSyncTime,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.lastDbSyncTime = now;
        this.saveToLocalStorage(); // Update local storage with new DB sync time

        console.log("Resources synced to database successfully");

        // Turn off offline mode if we were in it
        if (this.offlineMode) {
          this.offlineMode = false;
          console.log("Reconnected to database, offline mode disabled");
        }
      } else {
        console.error(`Failed to sync to database: ${response.status}`);
        this.offlineMode = true;
      }
    } catch (error) {
      console.error("Error syncing to database:", error);
      this.offlineMode = true;
    } finally {
      this.isSyncing = false;
    }
  },

  // Create the display
  createDisplay() {
    const container = document.getElementById("resources-container");
    if (!container) {
      console.error("Resources container not found");
      return;
    }

    // Clear the container
    container.innerHTML = "";

    // Create heading
    const heading = document.createElement("h4");
    heading.className = "resources-heading";
    heading.textContent = "Resources";
    container.appendChild(heading);

    // Create resource list
    const resourceList = document.createElement("div");
    resourceList.id = "resource-list";
    resourceList.className = "resource-list";
    container.appendChild(resourceList);

    // Group resources by rarity
    const commonResources = ["wood", "stone", "iron", "copper", "coal"];
    const uncommonResources = [
      "platina",
      "palladium",
      "iridium",
      "rhodium",
      "osmium",
    ];
    const rareResources = ["ruthenium", "rhenium", "galium", "terbium"];
    const exoticResources = [
      "plasmatron",
      "chromitium",
      "neptunium",
      "xenarium",
      "protorium",
    ];

    // Add common resources
    this.addResourceGroup(resourceList, commonResources, "Common Resources");

    // Add uncommon resources
    this.addResourceGroup(
      resourceList,
      uncommonResources,
      "Uncommon Resources"
    );

    // Add rare resources
    this.addResourceGroup(resourceList, rareResources, "Rare Resources");

    // Add exotic resources
    this.addResourceGroup(resourceList, exoticResources, "Exotic Resources");

    // Add offline mode warning if needed
    if (this.offlineMode) {
      const warningDiv = document.createElement("div");
      warningDiv.className = "offline-warning alert alert-warning";
      warningDiv.style.marginTop = "10px";
      warningDiv.innerHTML = `
        <small>⚠️ Database connection issue - resources are being saved locally and will sync when possible.</small>
      `;
      container.appendChild(warningDiv);
    }
  },

  // Helper method to add a group of resources
  addResourceGroup(resourceList, resourceGroup, groupTitle) {
    // Add group heading
    const groupHeading = document.createElement("div");
    groupHeading.className = "resource-group-heading";
    groupHeading.textContent = groupTitle;
    resourceList.appendChild(groupHeading);

    // Add resource items
    resourceGroup.forEach((type) => {
      const div = document.createElement("div");
      div.id = `resource-${type}`;
      div.className = "resource-item";

      // Get the current amount
      const amount = Math.floor(this.resources[type] || 0);

      div.innerHTML = `
        <div class="resource-name">${
          type.charAt(0).toUpperCase() + type.slice(1)
        }</div>
        <div class="resource-amount" id="${type}-amount">${amount}</div>
        <div class="resource-rate">(${this.resourceRates[type].min}-${
        this.resourceRates[type].max
      }/s)</div>
      `;

      resourceList.appendChild(div);
    });

    // Add spacer
    const spacer = document.createElement("div");
    spacer.className = "resource-group-spacer";
    resourceList.appendChild(spacer);
  },

  // Start the update interval
  startUpdates() {
    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Update every second
    this.intervalId = setInterval(() => {
      this.updateResources();
    }, 1000);
  },

  // Update resources
  updateResources() {
    // For each resource type
    this.resourceTypes.forEach((type) => {
      const rate = this.resourceRates[type];

      // Check if resource should gain this tick
      if (Math.random() < rate.chance) {
        // Calculate gain
        const gain = Math.random() * (rate.max - rate.min) + rate.min;

        // Add to resources
        this.resources[type] = (this.resources[type] || 0) + gain;

        // Update display
        const amountElement = document.getElementById(`${type}-amount`);
        if (amountElement) {
          // Round for display
          const displayAmount = Math.floor(this.resources[type]);
          amountElement.textContent = displayAmount;

          // Add flash animation
          amountElement.style.color = "#98f1e7";
          amountElement.style.textShadow = "0 0 8px rgba(79, 209, 197, 0.7)";
          setTimeout(() => {
            amountElement.style.color = "";
            amountElement.style.textShadow = "";
          }, 500);
        }
      }
    });

    // Save to localStorage regularly (every 10 seconds approximately)
    if (Math.random() < 0.1) {
      this.saveToLocalStorage();
    }

    // Check if we should sync to database
    const now = Date.now();
    if (now - this.lastDbSyncTime >= this.dbSyncInterval) {
      this.syncToDatabase();
    }
  },

  // Set up save handlers
  setupSaveHandlers() {
    // Save when leaving the page
    window.addEventListener("beforeunload", () => {
      this.saveToLocalStorage();
      this.forceSyncToDatabase();
    });

    // Save when logging out
    document.addEventListener("nebulous-logout", () => {
      this.saveToLocalStorage();
      this.forceSyncToDatabase();
    });

    // Save to localStorage periodically
    setInterval(() => {
      this.saveToLocalStorage();
    }, 60000); // Save every minute

    // Sync to database periodically
    setInterval(() => {
      this.syncToDatabase();
    }, this.dbSyncInterval);
  },

  // Force sync to database (for logout or page unload)
  forceSyncToDatabase() {
    // For synchronous events, use navigator.sendBeacon
    try {
      const token = localStorage.getItem("token");
      if (!token || this.offlineMode) return;

      const data = {
        resources: this.resources,
        lastSync: this.lastSyncTime,
      };

      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });

      navigator.sendBeacon("/api/resources/sync", blob);
      console.log("Forced database sync on page unload");
    } catch (error) {
      console.error("Error during forced database sync:", error);
    }
  },
};

// Initialize when the DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded - initializing resource manager");

  setTimeout(() => {
    SimpleResourceManager.initialize();
  }, 500);
});

// Expose the manager globally
window.SimpleResourceManager = SimpleResourceManager;

// Add this function at the end of your resources.js file

// Manual fix to ensure resources are saved to the database
function saveResourcesOnExit() {
  // Ensure the resource manager is initialized
  if (!window.SimpleResourceManager || !window.SimpleResourceManager.resources)
    return;

  const token = localStorage.getItem("token");
  if (!token) return;

  console.log("Saving resources to database before exit...");

  // Get the username to display in logs
  const username =
    document.getElementById("username")?.textContent || "unknown";

  // Create a synchronous request to make sure it completes before page unload
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/planet/resources", false); // synchronous request
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);

  try {
    xhr.send(
      JSON.stringify({
        resources: window.SimpleResourceManager.resources,
      })
    );

    console.log(
      `Resources for ${username} saved to database before exit. Status: ${xhr.status}`
    );
  } catch (e) {
    console.error("Error saving resources:", e);
  }
}

// Add event listeners for page exit and logout
window.addEventListener("beforeunload", saveResourcesOnExit);
document.addEventListener("nebulous-logout", saveResourcesOnExit);

// Also add periodic saving every 30 seconds
setInterval(function () {
  if (window.SimpleResourceManager && window.SimpleResourceManager.resources) {
    fetch("/api/planet/resources", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resources: window.SimpleResourceManager.resources,
      }),
    })
      .then((response) => {
        if (response.ok) {
          console.log("Resources saved to database successfully");
        } else {
          console.warn(
            "Failed to save resources to database:",
            response.status
          );
        }
      })
      .catch((error) => {
        console.error("Error saving resources to database:", error);
      });
  }
}, 30000); // 30 seconds

// function addResourceDebugButton() {
//   setTimeout(() => {
//     const container = document.getElementById("resources-container");
//     if (!container) return;

//     // Create debug button
//     const debugBtn = document.createElement("div");
//     debugBtn.className = "text-center mt-3";
//     debugBtn.innerHTML = `
//       <button id="check-db-resources" class="btn btn-sm btn-secondary">
//         Check DB Resources
//       </button>
//       <button id="force-save-resources" class="btn btn-sm btn-primary ml-2">
//         Force Save
//       </button>
//     `;

//     // Add to container at the end
//     container.appendChild(debugBtn);

//     // Add event listener
//     document
//       .getElementById("check-db-resources")
//       .addEventListener("click", async function () {
//         try {
//           const token = localStorage.getItem("token");
//           if (!token) {
//             alert("No token found, please log in first");
//             return;
//           }

//           const response = await fetch("/api/debug/resources", {
//             headers: {
//               Authorization: `Bearer ${token}`,
//             },
//           });

//           const data = await response.json();

//           // Show the resource data
//           alert(JSON.stringify(data, null, 2));
//         } catch (error) {
//           console.error("Error checking DB resources:", error);
//           alert("Error checking DB resources: " + error.message);
//         }
//       });

//     // Add event listener for force save
//     document
//       .getElementById("force-save-resources")
//       .addEventListener("click", function () {
//         try {
//           saveResourcesOnExit();
//           alert("Resources force saved to database");
//         } catch (error) {
//           console.error("Error force saving resources:", error);
//           alert("Error force saving resources: " + error.message);
//         }
//       });
//   }, 1000);
// }

// Call the function to add the button
// document.addEventListener("DOMContentLoaded", addResourceDebugButton);
