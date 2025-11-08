import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// --- Configuration ---
let CURRENT_USER_ID = null;
let CURRENT_SESSION_ID = "";
let ACTIVE_PLACE_ID = "all"; // 'all' by default
let allPlacesCache = []; // Cache places for rendering item lists

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Predefined list of categories
const ITEM_CATEGORIES = [
  "Uncategorized",
  "Tech",
  "Clothing",
  "Toiletries",
  "Documents",
  "Books",
  "Hobby",
  "Other",
];

//State for Bulk Edit
let selectedItems = [];

// --- UI Elements ---
const appContainer = document.getElementById("app-container");
const authContainer = document.getElementById("auth-container");
const appControls = document.getElementById("app-controls");
const logoutBtn = document.getElementById("logout-btn");
const sessionIdDisplay = document.getElementById("session-id-display");

// --- Auth Functions ---

/**
 * Checks for an existing user session.
 * If found, initializes the app.
 * If not, shows the login/signup forms.
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

  if (session) {
    // User is logged in
    initializeApp(session.user);
  } else {
    // No user logged in
    showAuthUI();
  }
}

/**
 * Initializes the main application UI for a logged-in user.
 */
async function initializeApp(user) {
  console.log("User logged in:", user.email);
  CURRENT_USER_ID = user.id;
  CURRENT_SESSION_ID = `sess_${Date.now()}`;

  // Show user email and logout button
  sessionIdDisplay.innerText = user.email;
  logoutBtn.classList.remove("hidden");

  // Show app, hide auth
  authContainer.classList.add("hidden");
  appContainer.classList.remove("hidden");
  appControls.classList.remove("hidden");

  // Check for default places (same as before)
  await initDefaultPlaces();

  // Setup main app UI
  setupModals();
  document
    .getElementById("export-csv-btn")
    .addEventListener("click", exportActionsToCSV);

  // Listeners for the Smart Bulk Action Bar
  document
    .getElementById("select-all-checkbox")
    .addEventListener("click", handleSelectAll);

  // Listeners for the new bulk "..." menu
  document.getElementById("bulk-action-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("bulk-action-menu");
    const isAlreadyOpen = menu.classList.contains("show");
    closeAllActionMenus(); // close item menus
    if (!isAlreadyOpen) {
      menu.classList.add("show");
    }
  });
  document.getElementById("bulk-menu-move").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleBulkMove();
    closeAllActionMenus();
  });
  document.getElementById("bulk-menu-delete").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleBulkDelete();
    closeAllActionMenus();
  });

  // Initial Render
  await renderPlaces();
  await renderItems();
}

/**
 * Shows the login/signup forms.
 */
function showAuthUI() {
  console.log("No user session, showing Auth UI.");
  // Hide app, show auth
  authContainer.classList.remove("hidden");
  appContainer.classList.add("hidden");
  appControls.classList.add("hidden");

  // Clear user display and hide logout
  sessionIdDisplay.innerText = "Logged Out";
  logoutBtn.classList.add("hidden");
}

/**
 * Handles the user Sign Up form.
 */
async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const authMessage = document.getElementById("auth-message");

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error signing up: " + error.message;
    return;
  }

  // Check your Supabase project settings.
  // If "Confirm email" is ON, show this message.
  authMessage.innerText =
    "Sign up successful! Please check your email to confirm.";
  // If "Confirm email" is OFF, the user is logged in. We can auto-login them.
  if (data.user) {
    authMessage.innerText = "Sign up successful! Logging you in...";
    initializeApp(data.user);
  }
}

/**
 * Handles the user Log In form.
 */
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const authMessage = document.getElementById("auth-message");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error logging in: " + error.message;
    return;
  }

  // Login successful, initialize the app
  authMessage.innerText = "";
  initializeApp(data.user);
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Error logging out:", error);
    return;
  }

  // This will clear the session.
  // We can just reload the page, and checkUserSession() will handle the rest.
  window.location.reload();
}

/**
 * Sets up listeners for the auth forms (login, signup, links).
 */
function setupAuthListeners() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document
    .getElementById("signup-form")
    .addEventListener("submit", handleSignUp);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Toggle between login and signup forms
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  document.getElementById("show-signup").addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
    document.getElementById("auth-message").innerText = "";
  });

  document.getElementById("show-login").addEventListener("click", (e) => {
    e.preventDefault();
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    document.getElementById("auth-message").innerText = "";
  });
}

// --- Database & App Functions ---

// Checks if a new user needs default places created.
async function initDefaultPlaces() {
  const { data, error } = await supabaseClient
    .from("places")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .limit(1);

  if (error) console.error("Error checking for places:", error);

  if (data && data.length === 0) {
    console.log("No places found, creating defaults...");
    const defaultPlaces = [
      { name: "Casa Uni", user_id: CURRENT_USER_ID },
      { name: "Casa Genitori", user_id: CURRENT_USER_ID },
      { name: "Valigia", user_id: CURRENT_USER_ID },
    ];

    const { error: insertError } = await supabaseClient
      .from("places")
      .insert(defaultPlaces);
    if (insertError)
      console.error("Error creating default places:", insertError);

    defaultPlaces.forEach((place) => {
      logAction("create_place", { place_name: place.name });
    });
  }
}

async function getPlaces() {
  const { data, error } = await supabaseClient
    .from("places")
    .select("*")
    .eq("user_id", CURRENT_USER_ID);
  if (error) console.error("Error fetching places:", error);
  return data || [];
}

async function getItems() {
  const { data, error } = await supabaseClient
    .from("items")
    .select("*, places(name)") // Join to get place name
    .eq("user_id", CURRENT_USER_ID);
  if (error) console.error("Error fetching items:", error);
  return data || [];
}

function getPlaceName(placeId, allPlaces) {
  if (!placeId) return "N/A";
  const place = allPlaces.find((p) => p.id === placeId);
  return place ? place.name : "Unknown";
}

// Populates the category dropdown in the 'Add Item' modal
function populateCategoryDropdown() {
  const select = document.getElementById("new-item-category");
  select.innerHTML = ""; // Clear old options

  ITEM_CATEGORIES.forEach((category) => {
    select.innerHTML += `<option value="${category}">${category}</option>`;
  });
}

async function logAction(action_type, data = {}) {
  const newAction = {
    user_id: CURRENT_USER_ID,
    session_id: CURRENT_SESSION_ID,
    action_type: action_type,
    item_id: data.item_id || null,
    item_name: data.item_name || null,
    from_place_id: data.from_place_id || null,
    to_place_id: data.to_place_id || null,
    metadata: data.metadata || null,
    created_at: new Date().toISOString(),
  };

  if (action_type === "create_item") {
    newAction.to_place_id = data.place_id;
  }
  if (action_type === "create_place") {
    // We need the ID from the DB, so this log is slightly different.
    // Let's just log the name.
    newAction.item_name = data.place_name;
  }

  const { error } = await supabaseClient.from("actions").insert(newAction);
  if (error) console.error("Error logging action:", error);
  else console.log("Action Logged:", newAction);
}

// --- Render Functions (Unchanged) ---
async function renderPlaces() {
  const places = await getPlaces();
  allPlacesCache = places; // Update cache
  const ul = document.getElementById("places-list");
  ul.innerHTML = `<li data-id="all" class="${
    ACTIVE_PLACE_ID === "all" ? "active" : ""
  }">All Items</li>`;

  places.forEach((place) => {
    ul.innerHTML += `<li data-id="${place.id}" class="${
      ACTIVE_PLACE_ID === place.id ? "active" : ""
    }">${place.name}</li>`;
  });

  ul.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      ACTIVE_PLACE_ID = li.getAttribute("data-id");
      renderPlaces();
      renderItems();
    });
  });
  updatePlaceDropdowns(places);
}

async function renderItems() {
  const items = await getItems();
  const ul = document.getElementById("items-list");
  ul.innerHTML = "";

  const filteredItems =
    ACTIVE_PLACE_ID === "all"
      ? items
      : items.filter((item) => item.place_id === ACTIVE_PLACE_ID);

  // Update the header *before* rendering items
  updateBulkActionUI(filteredItems.length);

  if (filteredItems.length === 0) {
    ul.innerHTML = "<li>No items found in this place.</li>";
    return;
  }

  filteredItems.forEach((item) => {
    const placeName = item.places
      ? item.places.name
      : getPlaceName(item.place_id, allPlacesCache);

    const isSelected = selectedItems.includes(item.id);

    ul.innerHTML += `
          <li data-id="${item.id}" class="${isSelected ? "item-selected" : ""}">
              
              <div class="item-info">
                  <input type="checkbox" class="item-checkbox" data-id="${
                    item.id
                  }" ${isSelected ? "checked" : ""}>
                  <div> <strong>${item.name}</strong> (${placeName})
                    <span class="item-category">${item.category || ""}</span>
                  </div>
              </div>
              
              <div class="action-menu-wrapper">
                  <button class="action-btn" data-item-id="${
                    item.id
                  }">...</button>
                  <div class="action-menu" id="menu-${item.id}">
                      <a href="#" class="menu-move" data-id="${
                        item.id
                      }" data-name="${item.name}" data-from-id="${
      item.place_id
    }">Move</a>
                      <a href="#" class="menu-rename" data-id="${
                        item.id
                      }" data-name="${item.name}">Rename</a>
                      <a href="#" class="menu-delete delete" data-id="${
                        item.id
                      }" data-name="${item.name}">Delete</a>
                  </div>
              </div>
          </li>
      `;
  });

  // --- Event Listeners (No change to menu listeners) ---
  ul.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const itemId = e.target.getAttribute("data-item-id");
      toggleActionMenu(itemId);
    });
  });
  ul.querySelectorAll(".menu-move").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMoveModal(
        e.target.dataset.id,
        e.target.dataset.name,
        e.target.dataset.fromId
      );
      closeAllActionMenus();
    });
  });
  ul.querySelectorAll(".menu-rename").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openRenameModal(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });
  ul.querySelectorAll(".menu-delete").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { id, name } = e.target.dataset;
      if (confirm(`Are you sure you want to delete "${name}"?`)) {
        handleDeleteItem(id, name);
      }
      closeAllActionMenus();
    });
  });

  // --- NEW: Event Listeners for Checkboxes ---
  ul.querySelectorAll(".item-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation(); // Stop click from bubbling to the LI
      const itemId = e.target.getAttribute("data-id");
      handleItemSelection(itemId, filteredItems.length);
    });
  });

  // NEW: Make the whole LI clickable to toggle checkbox
  ul.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", (e) => {
      // Don't trigger if clicking a button, link, or the checkbox itself
      if (
        e.target.matches("button") ||
        e.target.matches("a") ||
        e.target.matches(".item-checkbox") ||
        e.target.closest(".action-menu-wrapper")
      )
        return;

      const itemId = li.getAttribute("data-id");
      handleItemSelection(itemId, filteredItems.length);
    });
  });
}

// Toggles the visibility of a specific item's action menu.
function toggleActionMenu(itemId) {
  const menu = document.getElementById(`menu-${itemId}`);
  if (!menu) return;

  // Check if this menu is already open
  const isAlreadyOpen = menu.classList.contains("show");

  // First, close all other menus
  closeAllActionMenus();

  // If this menu was not already open, show it
  if (!isAlreadyOpen) {
    menu.classList.add("show");
  }
}

// Closes all open action menus.
function closeAllActionMenus() {
  document.querySelectorAll(".action-menu.show").forEach((openMenu) => {
    openMenu.classList.remove("show");
  });
}

// Handles deleting an item from the database.
async function handleDeleteItem(itemId, itemName) {
  console.log(`Deleting item ${itemId}: ${itemName}`);

  // 1. Delete the item from Supabase
  const { error } = await supabaseClient
    .from("items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting item:", error);
    alert("Error deleting item: " + error.message);
    return;
  }

  // 2. Log the action
  logAction("delete_item", {
    item_id: itemId,
    item_name: itemName,
  });

  // 3. Re-render the items list to show the change
  await renderItems();
}

async function handleRenameItem(itemId, newName) {
  console.log(`Renaming item ${itemId} to: ${newName}`);

  // 1. Update the item in Supabase
  const { error } = await supabaseClient
    .from("items")
    .update({ name: newName }) // Update the name
    .eq("id", itemId);

  if (error) {
    console.error("Error renaming item:", error);
    alert("Error renaming item: " + error.message);
    return;
  }

  // 2. Log the action
  logAction("rename_item", {
    item_id: itemId,
    item_name: newName, // Log the new name
    metadata: { note: `Renamed from old name` }, // We could store the old name here
  });

  // 3. Re-render the items list
  await renderItems();
}

/**
 * Handles adding/removing an item from the selectedItems array.
 */
function handleItemSelection(itemId, totalItems) {
  const index = selectedItems.indexOf(itemId);

  if (index > -1) {
    selectedItems.splice(index, 1);
  } else {
    selectedItems.push(itemId);
  }

  // Re-render just the list to show the highlight
  renderItems();
  // Update the header UI
  updateBulkActionUI(totalItems);
}

/**
 * Updates the text in the bulk action bar (e.g., "(2 items selected)")
 */
function updateBulkActionUI(totalItems = 0) {
  const bulkMenu = document.getElementById("bulk-action-menu-wrapper");
  const titleHeader = document.getElementById("items-header-title");
  const countSpan = document.getElementById("bulk-selected-count");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");

  if (selectedItems.length > 0) {
    // ---- Show the Bulk UI ----
    titleHeader.classList.add("hidden");
    countSpan.classList.remove("hidden");
    bulkMenu.classList.remove("hidden");

    countSpan.innerText = `${selectedItems.length} selected`;
    selectAllCheckbox.checked = selectedItems.length === totalItems;
  } else {
    // ---- Show the Normal Header ----
    titleHeader.classList.remove("hidden");
    countSpan.classList.add("hidden");
    bulkMenu.classList.add("hidden");

    selectAllCheckbox.checked = false;
  }
}

// --- ADD THESE NEW FUNCTIONS ---

/**
 * Handles the "Select All" checkbox.
 */
async function handleSelectAll() {
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const allItemNodes = document.querySelectorAll("#items-list li");

  if (selectAllCheckbox.checked) {
    // Select all items currently visible
    const allItemIds = [];
    allItemNodes.forEach((li) => {
      allItemIds.push(li.getAttribute("data-id"));
    });
    selectedItems = allItemIds;
  } else {
    // Deselect all
    selectedItems = [];
  }
  renderItems();
  updateBulkActionUI(allItemNodes.length);
}

/**
 * Handles the "Bulk Move" button.
 * Opens the new bulk-move-modal.
 */
async function handleBulkMove() {
  if (selectedItems.length === 0) {
    alert("Please select items to move.");
    return;
  }

  // 1. Populate the dropdown in the bulk move modal
  const select = document.getElementById("bulk-move-place-select");
  select.innerHTML = ""; // Clear old options
  allPlacesCache.forEach((place) => {
    select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
  });

  // 2. Update the count
  document.getElementById(
    "bulk-move-count"
  ).innerText = `${selectedItems.length}`;

  // 3. Show the modal
  document.getElementById("bulk-move-modal").style.display = "block";
}

/**
 * Handles the "Bulk Delete" button.
 */
async function handleBulkDelete() {
  if (
    !confirm(
      `Are you sure you want to delete ${selectedItems.length} items? This cannot be undone.`
    )
  ) {
    return;
  }

  console.log(`Deleting ${selectedItems.length} items...`);

  // 1. Delete the items from Supabase
  // We use the 'in' filter to delete all items whose ID is in our array
  const { error } = await supabaseClient
    .from("items")
    .delete()
    .in("id", selectedItems);

  if (error) {
    console.error("Error bulk deleting items:", error);
    alert("Error deleting items: " + error.message);
    return;
  }

  // 2. Log this as ONE action (for now)
  logAction("bulk_delete_items", {
    metadata: {
      item_count: selectedItems.length,
      item_ids: selectedItems,
    },
  });

  // 3. Clear selection and re-render
  selectedItems = [];
  renderItems();
  updateBulkActionUI();
}

/**
 * Runs when the user clicks "Move Items" in the bulk move modal.
 */
async function handleSaveBulkMove() {
  const toPlaceId = document.getElementById("bulk-move-place-select").value;
  if (!toPlaceId) {
    alert("Could not find a place to move to.");
    return;
  }

  console.log(`Bulk moving ${selectedItems.length} items to ${toPlaceId}`);

  // 1. Update all items in the array in one request
  const { error } = await supabaseClient
    .from("items")
    .update({ place_id: toPlaceId }) // Set the new place
    .in("id", selectedItems); // For all items in our array

  if (error) {
    console.error("Error bulk moving items:", error);
    alert("Error moving items: " + error.message);
    return;
  }

  // 2. Log this as one action
  logAction("bulk_move_items", {
    to_place_id: toPlaceId,
    metadata: {
      item_count: selectedItems.length,
      item_ids: selectedItems,
    },
  });

  // 3. Close modal
  document.getElementById("bulk-move-modal").style.display = "none";

  // 4. Clear selection and re-render
  selectedItems = [];
  renderItems(); // Re-draw the items list
  updateBulkActionUI(); // Show the normal header
}

function updatePlaceDropdowns(places) {
  if (!places) places = allPlacesCache;
  const selects = [
    document.getElementById("new-item-place"),
    document.getElementById("move-item-place"),
  ];

  selects.forEach((select) => {
    select.innerHTML = "";
    places.forEach((place) => {
      select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
    });
  });
}

// --- Modal Handling (Unchanged, but one fix in save-place) ---
function setupModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    const closeBtn = modal.querySelector(".close-btn");
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  });

  const addPlaceModal = document.getElementById("add-place-modal");
  document.getElementById("add-place-btn").onclick = () => {
    addPlaceModal.style.display = "block";
    document.getElementById("new-place-name").focus();
  };
  document.getElementById("save-place-btn").onclick = async () => {
    const name = document.getElementById("new-place-name").value;
    if (!name) return alert("Please enter a name.");

    const newPlace = { name: name, user_id: CURRENT_USER_ID };
    const { data, error } = await supabaseClient
      .from("places")
      .insert(newPlace)
      .select();

    if (error) {
      alert("Error creating place: " + error.message);
      return;
    }

    // Log action
    logAction("create_place", {
      place_id: data[0].id,
      place_name: data[0].name,
    });

    document.getElementById("new-place-name").value = "";
    addPlaceModal.style.display = "none";
    renderPlaces();
  };

  // --- Add Item Modal ---
  const addItemModal = document.getElementById("add-item-modal");
  document.getElementById("add-item-btn").onclick = () => {
    // NEW: Populate the category dropdown *before* showing the modal
    populateCategoryDropdown();

    addItemModal.style.display = "block";
    document.getElementById("new-item-name").focus();
  };

  document.getElementById("save-item-btn").onclick = async () => {
    const name = document.getElementById("new-item-name").value;
    const category = document.getElementById("new-item-category").value;
    const place_id = document.getElementById("new-item-place").value;
    if (!name || !place_id) return alert("Name and place are required.");

    const newItem = {
      name: name,
      category: category,
      place_id: place_id,
      user_id: CURRENT_USER_ID,
    };
    const { data, error } = await supabaseClient
      .from("items")
      .insert(newItem)
      .select();

    if (error) {
      alert("Error creating item: " + error.message);
      return;
    }

    logAction("create_item", {
      item_id: data[0].id,
      item_name: data[0].name,
      place_id: data[0].place_id,
    });

    document.getElementById("new-item-name").value = "";
    document.getElementById("new-item-category").value = "";
    addItemModal.style.display = "none";
    renderItems();
  };

  document.getElementById("save-move-btn").onclick = async () => {
    const itemId = document.getElementById("move-item-id").value;
    const toPlaceId = document.getElementById("move-item-place").value;

    const { data: itemData, error: findError } = await supabaseClient
      .from("items")
      .select("name, place_id")
      .eq("id", itemId)
      .single();

    if (findError) return alert("Item not found.");

    const fromPlaceId = itemData.place_id;
    if (fromPlaceId === toPlaceId) {
      document.getElementById("move-item-modal").style.display = "none";
      return;
    }

    const { error } = await supabaseClient
      .from("items")
      .update({ place_id: toPlaceId })
      .eq("id", itemId);

    if (error) {
      alert("Error moving item: " + error.message);
      return;
    }

    logAction("move_item", {
      item_id: itemId,
      item_name: itemData.name,
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
    });

    document.getElementById("move-item-modal").style.display = "none";
    renderItems();
  };
  // --- Rename Item Modal ---
  document.getElementById("save-rename-btn").onclick = async () => {
    const itemId = document.getElementById("rename-item-id").value;
    const newName = document.getElementById("rename-item-name-new").value;

    if (!newName) {
      alert("Please enter a new name.");
      return;
    }

    // Call our new handler function
    await handleRenameItem(itemId, newName);

    // Close the modal
    document.getElementById("rename-item-modal").style.display = "none";
  };

  // --- Bulk Move Modal ---
  document.getElementById("save-bulk-move-btn").onclick = handleSaveBulkMove;
}

function openMoveModal(id, name, fromId) {
  const targetSelect = document.getElementById("move-item-place");
  const firstDifferentPlace = allPlacesCache.find((p) => p.id !== fromId);
  if (firstDifferentPlace) {
    targetSelect.value = firstDifferentPlace.id;
  }
  document.getElementById("move-item-name").innerText = name;
  document.getElementById("move-item-id").value = id;
  document.getElementById("move-item-modal").style.display = "block";
}

function openRenameModal(id, currentName) {
  document.getElementById("rename-item-id").value = id;
  document.getElementById("rename-item-name-old").innerText = currentName;
  document.getElementById("rename-item-name-new").value = currentName; // Pre-fill with old name
  document.getElementById("rename-item-modal").style.display = "block";
  document.getElementById("rename-item-name-new").focus();
}

// --- Export Function (Unchanged) ---
async function exportActionsToCSV() {
  const { data: actions, error } = await supabaseClient
    .from("actions")
    .select("*")
    .eq("user_id", CURRENT_USER_ID);

  if (error) return alert("Error fetching actions: " + error.message);
  if (!actions || actions.length === 0) {
    alert("No actions to export.");
    return;
  }

  const headers = Object.keys(actions[0]);
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += headers.join(",") + "\n";

  actions.forEach((row) => {
    const values = headers.map((header) => {
      let val = row[header];
      if (header === "user_id") {
        val = `user_${val.substring(0, 8)}`;
      }
      if (typeof val === "string") {
        val = '"' + val.replace(/"/g, '""') + '"';
      } else if (val === null) {
        val = '""';
      }
      return val;
    });
    csvContent += values.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "nomadcloset_actions_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  logAction("export_csv", { metadata: { rows: actions.length } });
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Set up listeners for the Login/Signup forms
  setupAuthListeners();

  // 2. Check if the user is already logged in
  checkUserSession();

  // Add a global click listener for menus AND modals
  // This will close any open "..." menus if you click anywhere else
  window.addEventListener("click", function (event) {
    // 1. Close "..." menus if clicking outside
    if (!event.target.matches(".action-btn")) {
      closeAllActionMenus();
    }

    // 2. Close modals if clicking on the gray background
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  });
});
