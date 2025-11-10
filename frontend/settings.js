import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// --- Configuration ---
let CURRENT_USER_ID = null;
let allCategoriesCache = [];

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Auth Functions ---

/**
 * Checks for an existing user session.
 * If NOT found, redirects to login.html.
 * If found, initializes the page.
 */
async function checkUserSession() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
    return;
  }

  if (!session) {
    // NO user logged in, redirect to login
    window.location.href = "login.html";
  } else {
    // User is logged in, start the app
    initializeApp(session.user);
  }
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

/**
 * Initializes the settings page.
 */
async function initializeApp(user) {
  document.body.style.visibility = "visible"; // Un-hide page
  CURRENT_USER_ID = user.id;

  // Setup header
  document.getElementById("user-email-display").innerText = user.email;
  document.getElementById("profile-email-display").innerText = user.email;
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Setup navigation
  setupNavigation();

  // Load initial data
  await getCategories();

  // Populate the default (Categories) page
  await populateCategoryList();

  // Listeners for Mobile Burger Menu
  const mobileMenu = document.getElementById("mobile-menu");

  // Open Button
  document.getElementById("burger-menu-btn").addEventListener("click", () => {
    mobileMenu.classList.remove("mobile-menu-hidden");
  });

  // Close Button
  document
    .getElementById("mobile-menu-close-btn")
    .addEventListener("click", () => {
      mobileMenu.classList.add("mobile-menu-hidden");
    });

  // Link the buttons inside the mobile menu
  document
    .getElementById("mobile-logout-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });

  // Link the "Add" button
  document
    .getElementById("add-category-btn")
    .addEventListener("click", handleAddCategory);

  //Link the Change Password form
  document
    .getElementById("change-password-form")
    .addEventListener("submit", handleChangePassword);

  // Link the "Log Out All" button
  document
    .getElementById("logout-all-btn")
    .addEventListener("click", async () => {
      if (confirm("Are you sure you want to log out from all other devices?")) {
        const { error } = await supabaseClient.auth.signOut({
          scope: "global",
        });
        if (error) {
          alert("Error logging out: " + error.message);
        } else {
          alert(
            "Successfully logged out from all sessions. You will be logged out here as well."
          );
          window.location.href = "login.html";
        }
      }
    });

  // --- Link the "Delete Account" button ---
  const deleteLink = document.getElementById("delete-account-link");

  // IMPORTANT: Change this to your email
  const supportEmail = "delete.nomadcloset.metkf@slmails.com";
  const userEmail = user.email;
  const subject = "Account Deletion Request - NomadCloset";
  const body = `Hello,

Please delete my account and all associated data for the user:
${userEmail}

Thank you.
    `;

  // Set the mailto link
  deleteLink.href = `mailto:${supportEmail}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  // Add your "15-day" alert
  deleteLink.addEventListener("click", () => {
    alert(
      "This will open your email client to send a deletion request.\n\nThis is a manual process. Your account and data will be permanently deleted within 15 days."
    );
  });

  // Setup User Menu
  document.getElementById("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("user-menu");
    menu.classList.toggle("show");
  });
  window.addEventListener("click", (e) => {
    if (!e.target.matches(".action-btn")) {
      document.getElementById("user-menu").classList.remove("show");
    }
  });
}

// --- Navigation ---
function setupNavigation() {
  const navItems = {
    "nav-profile": "profile-page",
    "nav-categories": "categories-page",
  };

  const settingsNav = document.getElementById("settings-nav");
  const contentPages = document.querySelectorAll(".settings-page");

  settingsNav.addEventListener("click", (e) => {
    if (e.target.tagName !== "LI") return;

    const targetId = e.target.id;
    const pageId = navItems[targetId];

    // 1. Hide all pages
    contentPages.forEach((page) => page.classList.add("hidden"));

    // 2. De-activate all nav items
    settingsNav
      .querySelectorAll("li")
      .forEach((li) => li.classList.remove("active"));

    // 3. Show target page
    document.getElementById(pageId).classList.remove("hidden");

    // 4. Populate the page if it's Places or Categories
    if (pageId === "categories-page") {
      populateCategoryList();
    }

    // 5. Activate target nav item
    e.target.classList.add("active");
  });

  // Show the categories page by default
  document.getElementById("nav-profile").click();
}

//
// ==============================
// CATEGORY MANAGEMENT FUNCTIONS
// ==============================
//

async function getCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .eq("user_id", CURRENT_USER_ID)
    .order("name");
  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
  allCategoriesCache = data;
  return data || [];
}

/**
 * Populates the category list in the settings page.
 */
async function populateCategoryList() {
  const list = document.getElementById("category-list");
  list.innerHTML = "<li>Loading...</li>";

  // Re-fetch to be 100% up-to-date
  await getCategories();
  list.innerHTML = "";

  if (allCategoriesCache.length === 0) {
    list.innerHTML = "<li>No categories found.</li>";
  }

  allCategoriesCache.forEach((category) => {
    const li = document.createElement("li");
    li.dataset.id = category.id;
    li.innerHTML = `
            <span>${category.name}</span>
            <div>
                <button class="rename-cat-btn">Rename</button>
                <button class="delete-cat-btn">X</button>
            </div>
        `;
    list.appendChild(li);

    // Add listeners
    li.querySelector(".rename-cat-btn").addEventListener("click", () =>
      handleRenameCategory(category.id, category.name)
    );
    li.querySelector(".delete-cat-btn").addEventListener("click", () =>
      handleDeleteCategory(category.id, category.name)
    );
  });
}

async function handleAddCategory() {
  const nameInput = document.getElementById("new-category-name");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a category name.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("categories")
    .insert({ name: name, user_id: CURRENT_USER_ID })
    .select();

  if (error) {
    if (error.code === "23505")
      alert("A category with this name already exists.");
    else alert("Error adding category: " + error.message);
    return;
  }
  nameInput.value = "";
  await populateCategoryList(); // Just refresh the list
}

async function handleRenameCategory(categoryId, oldName) {
  const newName = prompt(`Rename category "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const { error } = await supabaseClient
    .from("categories")
    .update({ name: newName.trim() })
    .eq("id", categoryId);

  if (error) {
    alert("Error renaming category: " + error.message);
    return;
  }
  await populateCategoryList(); // Refresh the list
}

async function handleDeleteCategory(categoryId, name) {
  if (
    !confirm(
      `Are you sure you want to delete the category "${name}"?\n\nThis will NOT delete your items, but they will become "Uncategorized".`
    )
  )
    return;

  const { error } = await supabaseClient
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    alert("Error deleting category: " + error.message);
    return;
  }
  await populateCategoryList(); // Refresh the list
}

// PROFILE MANAGEMENT FUNCTIONS
async function handleChangePassword(e) {
  e.preventDefault(); // Stop the form from submitting
  const newPassword = document.getElementById("new-password").value;
  const msgEl = document.getElementById("password-message");

  if (newPassword.length < 6) {
    msgEl.innerText = "Error: Password must be at least 6 characters long.";
    msgEl.className = "form-message error";
    return;
  }

  msgEl.innerText = "Updating password...";
  msgEl.className = "form-message";

  // Supabase auth function to update the user
  const { data, error } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    msgEl.innerText = "Error: " + error.message;
    msgEl.className = "form-message error";
  } else {
    msgEl.innerText =
      "Success! Your password has been updated. You will be logged out everywhere.";
    msgEl.className = "form-message success";
    document.getElementById("new-password").value = "";

    // This logs the user out from ALL devices, including this one.
    await supabaseClient.auth.signOut({ scope: "global" });

    // Redirect to login page after 2 seconds
    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);
  }
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  checkUserSession();
});
