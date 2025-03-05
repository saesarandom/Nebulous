// Nebulous Application - Shared JavaScript Functions

// Check authentication on page load
document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in (token exists)
  const token = localStorage.getItem("token");
  if (!token) {
    // Redirect to login if not logged in
    window.location.href = "login.html";
    return;
  }

  // Fetch user data
  fetchUserData();

  // Logout functionality
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      // Dispatch a custom event before logout to let other scripts know
      document.dispatchEvent(new CustomEvent("nebulous-logout"));

      // Now clear token and redirect
      localStorage.removeItem("token");
      localStorage.removeItem("loginTimestamp"); // Clear login timestamp for time counter

      window.location.href = "login.html";
    });
  }

  // Highlight the active navigation button
  highlightActiveNav();
});

// Function to fetch user data
async function fetchUserData() {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch("/api/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const userData = await response.json();
      const usernameElement = document.getElementById("username");
      if (usernameElement) {
        usernameElement.textContent = userData.username;
      }
    } else {
      // If token is invalid, redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("loginTimestamp"); // Clear login timestamp for time counter
      window.location.href = "login.html";
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }
}

// Function to highlight the active navigation button
function highlightActiveNav() {
  const currentPage = window.location.pathname.split("/").pop();
  const navButtons = document.querySelectorAll(".nav-btn");

  navButtons.forEach((button) => {
    const buttonHref = button.getAttribute("href");
    if (buttonHref === currentPage) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

// Show error message
function showError(message, elementId = "error-message") {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";

    // Hide the error after 5 seconds
    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  } else {
    console.error(message);
  }
}

// Show success message
function showSuccess(message, elementId = "success-message") {
  const successElement = document.getElementById(elementId);
  if (successElement) {
    successElement.textContent = message;
    successElement.style.display = "block";

    // Hide the success message after 5 seconds
    setTimeout(() => {
      successElement.style.display = "none";
    }, 5000);
  } else {
    console.log(message);
  }
}

// Format date to readable string
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

// Parse JWT token
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    return null;
  }
}

// Check if token is expired
function isTokenExpired(token) {
  const parsedToken = parseJwt(token);
  if (!parsedToken) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  return parsedToken.exp < currentTime;
}
