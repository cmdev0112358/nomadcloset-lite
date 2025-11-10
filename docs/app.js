import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// --- Configuration ---
let CURRENT_USER_ID = null;
let CURRENT_SESSION_ID = "";
let ACTIVE_PLACE_ID = "all";
let allPlacesCache = [];
let allCategoriesCache = [];
let selectedItems = [];
let currentSearchQuery = "";
let currentCategoryFilter = "all";
let currentSortOrder = "name-asc";

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- UI Elements (for header) ---
const userEmailDisplay = document.getElementById("user-email-display");

// --- NEW: Auth Functions (Page Protection) ---

/**
 * Checks for an existing user session.
 * If NOT found, redirects to login.html.
 * If found, initializes the app.
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
    // NO user logged in
    // Redirect to the login page
    window.location.href = "login.html";
  } else {
    // User is logged in
    // Start the app!
    initializeApp(session.user);
  }
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error("Error logging out:", error);

  // After logging out, redirect to the login page
  window.location.href = "login.html";
}

/**
 * Initializes the main application UI for a logged-in user.
 */
async function initializeApp(user) {
  document.body.style.visibility = "visible";
  console.log("User logged in:", user.email);
  CURRENT_USER_ID = user.id;
  CURRENT_SESSION_ID = `sess_${Date.now()}`;

  // Show user email
  userEmailDisplay.innerText = user.email;

  // Fetch all categories into the cache
  await getCategories();

  // Setup main app UI
  setupModals();

  // --- Main App Listeners ---
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

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

  document
    .getElementById("mobile-export-csv-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      mobileMenu.classList.add("mobile-menu-hidden");
      exportActionsToCSV();
    });
  document
    .getElementById("mobile-logout-btn")
    .addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });

  // Listener for the User Menu
  document.getElementById("user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("user-menu");
    const isAlreadyOpen = menu.classList.contains("show");
    closeAllActionMenus(); // close item menus
    if (!isAlreadyOpen) {
      menu.classList.add("show");
    }
  });

  document.getElementById("export-csv-btn").addEventListener("click", (e) => {
    e.preventDefault();
    exportActionsToCSV();
  });

  // --- Filter/Search Listeners ---
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  searchInput.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value;
    if (currentSearchQuery.length > 0)
      clearSearchBtn.classList.remove("hidden");
    else clearSearchBtn.classList.add("hidden");
    renderItems();
  });
  clearSearchBtn.addEventListener("click", (e) => {
    currentSearchQuery = "";
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    renderItems();
  });
  populateCategoryFilter();
  document
    .getElementById("category-filter-select")
    .addEventListener("change", (e) => {
      currentCategoryFilter = e.target.value;
      renderItems();
    });

  // Listener for the sort dropdown
  document.getElementById("sort-select").addEventListener("change", (e) => {
    currentSortOrder = e.target.value;
    renderItems(); // Re-render the list with new sorting
  });

  // --- Bulk Action Listeners ---
  document
    .getElementById("select-all-checkbox")
    .addEventListener("click", handleSelectAll);
  document.getElementById("bulk-action-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("bulk-action-menu");
    const isAlreadyOpen = menu.classList.contains("show");
    closeAllActionMenus();
    if (!isAlreadyOpen) menu.classList.add("show");
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

  // --- Global Click Listener (for menus/modals) ---
  window.addEventListener("click", function (event) {
    if (!event.target.matches(".action-btn")) {
      closeAllActionMenus();
    }
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  });

  // --- RENDER THE APP ---
  await renderPlaces();
  await renderItems();
}

// --- Database & App Functions ---

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

async function initDefaultPlaces() {
  // 1. Check for places
  const { data: placesData, error: placesError } = await supabaseClient
    .from("places")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .limit(1);

  if (placesError) console.error("Error checking for places:", placesError);

  if (placesData && placesData.length === 0) {
    console.log("No places found, creating defaults...");
    const defaultPlaces = [
      { name: "Casa Uni", user_id: CURRENT_USER_ID },
      { name: "Casa Genitori", user_id: CURRENT_USER_ID },
      { name: "Valigia", user_id: CURRENT_USER_ID },
    ];
    await supabaseClient.from("places").insert(defaultPlaces);
    logAction("create_place", { metadata: { created_defaults: true } });
  }

  // 2. Check for categories
  const { data: categoriesData, error: categoriesError } = await supabaseClient
    .from("categories")
    .select("id")
    .eq("user_id", CURRENT_USER_ID)
    .limit(1);

  if (categoriesError)
    console.error("Error checking for categories:", categoriesError);

  if (categoriesData && categoriesData.length === 0) {
    console.log("No categories found, creating defaults...");
    const defaultCategories = [
      { name: "Uncategorized", user_id: CURRENT_USER_ID },
      { name: "Tech", user_id: CURRENT_USER_ID },
      { name: "Clothing", user_id: CURRENT_USER_ID },
      { name: "Toiletries", user_id: CURRENT_USER_ID },
      { name: "Documents", user_id: CURRENT_USER_ID },
      { name: "Books", user_id: CURRENT_USER_ID },
      { name: "Hobby", user_id: CURRENT_USER_ID },
      { name: "Other", user_id: CURRENT_USER_ID },
    ];
    await supabaseClient.from("categories").insert(defaultCategories);
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
  // 1. Deconstruct the sort order
  // 'name-asc' becomes column 'name', ascending 'true'
  const [column, order] = currentSortOrder.split("-");
  const ascending = order === "asc";

  // 2. Build the query
  const { data, error } = await supabaseClient
    .from("items")
    .select("*, places(name), categories(name)")
    .eq("user_id", CURRENT_USER_ID)
    // 3. Add the .order() clause
    .order(column, { ascending: ascending });

  if (error) {
    console.error("Error fetching items:", error);
    return [];
  }
  return data || [];
}

function getPlaceName(placeId, allPlaces) {
  if (!placeId) return "N/A";
  const place = allPlaces.find((p) => p.id === placeId);
  return place ? place.name : "Unknown";
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
    newAction.item_name = data.place_name;
  }

  const { error } = await supabaseClient.from("actions").insert(newAction);
  if (error) console.error("Error logging action:", error);
  else console.log("Action Logged:", newAction);
}

// --- renderPlaces FUNCTION ---
async function renderPlaces() {
  const places = await getPlaces();
  allPlacesCache = places;
  const ul = document.getElementById("places-list");
  ul.innerHTML = ""; // Clear the list

  // Add the two "virtual" places
  ul.innerHTML += `<li data-id="all" class="${
    ACTIVE_PLACE_ID === "all" ? "active" : ""
  }"><span class="place-name">All Items</span></li>`;
  ul.innerHTML += `<li data-id="null" class="${
    ACTIVE_PLACE_ID === "null" ? "active" : ""
  }"><span class="place-name">Unassigned</span></li>`;

  // Add all real places from the database
  places.forEach((place) => {
    ul.innerHTML += `
            <li data-id="${place.id}" class="${
      ACTIVE_PLACE_ID === place.id ? "active" : ""
    }">
                <span class="place-name">${place.name}</span>
                <div class="action-menu-wrapper">
                    <button class="action-btn" data-place-id="${
                      place.id
                    }">⋮</button>
                    <div class="action-menu" id="menu-place-${place.id}">
                        <a href="#" class="menu-rename-place" data-id="${
                          place.id
                        }" data-name="${place.name}">Rename</a>
                        <a href="#" class="menu-delete-place delete" data-id="${
                          place.id
                        }" data-name="${place.name}">Delete</a>
                    </div>
                </div>
            </li>
        `;
  });

  // ---Listeners ---

  // 1. For clicking on the place name
  ul.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", (e) => {
      // Don't trigger if clicking a button/menu
      if (e.target.closest(".action-menu-wrapper")) return;

      ACTIVE_PLACE_ID = li.getAttribute("data-id");
      currentSearchQuery = "";
      document.getElementById("search-input").value = "";
      currentCategoryFilter = "all";
      populateCategoryFilter();

      renderPlaces();
      renderItems();
    });
  });

  // 2. For the "..." button
  ul.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const placeId = e.target.getAttribute("data-place-id");
      // Use our existing toggle function
      toggleActionMenu(`place-${placeId}`);
    });
  });

  // 3. For the "Rename" link
  ul.querySelectorAll(".menu-rename-place").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRenamePlace(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });

  // 4. For the "Delete" link
  ul.querySelectorAll(".menu-delete-place").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDeletePlace(e.target.dataset.id, e.target.dataset.name);
      closeAllActionMenus();
    });
  });

  updatePlaceDropdowns(places);
}

async function renderItems() {
  const items = await getItems();
  const ul = document.getElementById("items-list");
  ul.innerHTML = "";

  // 1. Filter by Active Place
  let placeFilteredItems;
  if (ACTIVE_PLACE_ID === "all") {
    placeFilteredItems = items;
  } else if (ACTIVE_PLACE_ID === "null") {
    // Show items where place_id is null
    placeFilteredItems = items.filter((item) => item.place_id === null);
  } else {
    // Show items for a specific place
    placeFilteredItems = items.filter(
      (item) => item.place_id === ACTIVE_PLACE_ID
    );
  }
  // 2. Filter by Search Query
  const searchFilteredItems =
    currentSearchQuery === ""
      ? placeFilteredItems
      : placeFilteredItems.filter((item) =>
          item.name.toLowerCase().includes(currentSearchQuery.toLowerCase())
        );

  // 3. Filter by Category
  const filteredItems =
    currentCategoryFilter === "all"
      ? searchFilteredItems
      : searchFilteredItems.filter(
          (item) => item.category_id === currentCategoryFilter
        );

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
                  <div> 
                    <strong>${item.name} ${
      item.quantity > 1 ? `(x${item.quantity})` : ""
    }</strong> (${placeName})
                    <span class="item-category">${
                      item.categories ? item.categories.name : ""
                    }</span>
                  </div>
              </div>
              
              <div class="action-menu-wrapper">
                  <button class="action-btn" data-item-id="${
                    item.id
                  }">⋮</button>
                  <div class="action-menu" id="menu-${item.id}">
                      <a href="#" class="menu-move" data-id="${
                        item.id
                      }" data-name="${item.name}" data-from-id="${
      item.place_id
    }">Move</a>
                      <a href="#" class="menu-modify" data-id="${
                        item.id
                      }" data-name="${item.name}" data-quantity="${
      item.quantity
    }">Modify</a>
                      <a href="#" class="menu-delete delete" data-id="${
                        item.id
                      }" data-name="${item.name}">Delete</a>
                  </div>
              </div>
          </li>
      `;
  });

  // --- Event Listeners for Menus ---
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
  ul.querySelectorAll(".menu-modify").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModifyModal(
        e.target.dataset.id,
        e.target.dataset.name,
        e.target.dataset.quantity
      );
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

  // --- Event Listeners for Checkboxes ---
  ul.querySelectorAll(".item-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      const itemId = e.target.getAttribute("data-id");
      handleItemSelection(itemId, filteredItems.length);
    });
  });
  ul.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", (e) => {
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

function populateCategoryDropdown() {
  const select = document.getElementById("new-item-category");
  select.innerHTML = "";

  allCategoriesCache.forEach((category) => {
    select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
  });
}

function populateCategoryFilter() {
  const select = document.getElementById("category-filter-select");
  select.innerHTML = "";

  select.innerHTML += `<option value="all">All Categories</option>`;

  allCategoriesCache.forEach((category) => {
    select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
  });

  select.value = currentCategoryFilter;
}

// --- Modal Handling ---
function setupModals() {
  // Add/Item/Place modals
  const addPlaceModal = document.getElementById("add-place-modal");
  document.getElementById("add-place-btn").onclick = () => {
    addPlaceModal.style.display = "block";
    document.getElementById("new-place-name").focus();
  };
  document.getElementById("save-place-btn").onclick = handleAddPlace;

  const addItemModal = document.getElementById("add-item-modal");
  document.getElementById("add-item-btn").onclick = () => {
    populateCategoryDropdown();

    // THIS IS THE NEW LOGIC
    const placeDropdown = document.getElementById("new-item-place");

    if (ACTIVE_PLACE_ID === "all" || ACTIVE_PLACE_ID === "null") {
      // If we're in "All Items" or "Unassigned", just select the first real place
      placeDropdown.selectedIndex = 0;
    } else {
      // If we are in a specific place, find it and select it!
      placeDropdown.value = ACTIVE_PLACE_ID;
    }

    addItemModal.style.display = "block";
    document.getElementById("new-item-name").focus();
  };

  document.getElementById("save-item-btn").onclick = async () => {
    const name = document.getElementById("new-item-name").value;
    const quantity =
      parseInt(document.getElementById("new-item-quantity").value) || 1;
    const category_id = document.getElementById("new-item-category").value;
    const place_id = document.getElementById("new-item-place").value;
    if (!name || !place_id) return alert("Name and place are required.");

    const newItem = {
      name: name,
      quantity: quantity,
      category_id: category_id,
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
    addItemModal.style.display = "none";
    renderItems();
  };

  // Rename/Move modals
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

  // Use new button ID
  document.getElementById("save-modify-btn").onclick = async () => {
    // Use new input IDs
    const itemId = document.getElementById("modify-item-id").value;
    const newName = document.getElementById("modify-item-name-new").value;
    const newQuantity =
      parseInt(document.getElementById("modify-item-quantity").value) || 1;

    if (!newName) {
      alert("Please enter a new name.");
      return;
    }

    // Call our handler function
    await handleModifyItem(itemId, newName, newQuantity);

    document.getElementById("modify-item-modal").style.display = "none";
  };

  // Bulk Move modal
  document.getElementById("save-bulk-move-btn").onclick = handleSaveBulkMove;

  // Generic close buttons
  document.querySelectorAll(".modal .close-btn").forEach((btn) => {
    btn.onclick = () => {
      btn.closest(".modal").style.display = "none";
    };
  });
}

// --- Action Menu Functions ---
function toggleActionMenu(itemId) {
  const menu = document.getElementById(`menu-${itemId}`);
  if (!menu) return;
  const isAlreadyOpen = menu.classList.contains("show");
  closeAllActionMenus();
  if (!isAlreadyOpen) menu.classList.add("show");
}

function closeAllActionMenus() {
  document.querySelectorAll(".action-menu.show").forEach((openMenu) => {
    openMenu.classList.remove("show");
  });
}

// --- Single Item Action Handlers ---
async function handleModifyItem(itemId, newName, newQuantity) {
  console.log(`Modifying item ${itemId} to: ${newName} (x${newQuantity})`);

  const { error } = await supabaseClient
    .from("items")
    .update({ name: newName, quantity: newQuantity })
    .eq("id", itemId);

  if (error) {
    console.error("Error modifying item:", error);
    alert("Error modifying item: " + error.message);
    return;
  }
  // Log it as 'modify_item'
  logAction("modify_item", {
    item_id: itemId,
    item_name: newName,
    metadata: { note: `Item modified` },
  });
  await renderItems();
}

//
// =============================
// PLACE MANAGEMENT FUNCTIONS
// =============================
//
async function handleAddPlace() {
  const nameInput = document.getElementById("new-place-name");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a place name.");
    return;
  }

  const { error } = await supabaseClient
    .from("places")
    .insert({ name: name, user_id: CURRENT_USER_ID });

  if (error) {
    if (error.code === "23505") alert("A place with this name already exists.");
    else alert("Error adding place: " + error.message);
    return;
  }
  nameInput.value = ""; // Clear the input
  document.getElementById("add-place-modal").style.display = "none"; // Close modal
  await renderPlaces(); // Refresh the list
}

async function handleRenamePlace(placeId, oldName) {
  const newName = prompt(`Rename place "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const { error } = await supabaseClient
    .from("places")
    .update({ name: newName.trim() })
    .eq("id", placeId);

  if (error) {
    alert("Error renaming place: " + error.message);
    return;
  }
  await renderPlaces(); // Refresh the list
}

async function handleDeletePlace(placeId, name) {
  if (
    !confirm(
      `Are you sure you want to delete the place "${name}"?\n\nAll items in this place will become "Unassigned".`
    )
  )
    return;

  const { error } = await supabaseClient
    .from("places")
    .delete()
    .eq("id", placeId);

  if (error) {
    alert("Error deleting place: " + error.message);
    return;
  }

  // If we deleted the place we are looking at, switch to "All Items"
  if (ACTIVE_PLACE_ID === placeId) {
    ACTIVE_PLACE_ID = "all";
  }

  await renderPlaces(); // Refresh the list
  await renderItems(); // Refresh items to show "Unassigned"
}

async function handleDeleteItem(itemId, itemName) {
  console.log(`Deleting item ${itemId}: ${itemName}`);
  const { error } = await supabaseClient
    .from("items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting item:", error);
    alert("Error deleting item: " + error.message);
    return;
  }
  logAction("delete_item", { item_id: itemId, item_name: itemName });
  await renderItems();
}

function openMoveModal(id, name, fromId) {
  const targetSelect = document.getElementById("move-item-place");
  const firstDifferentPlace = allPlacesCache.find((p) => p.id !== fromId);
  if (firstDifferentPlace) targetSelect.value = firstDifferentPlace.id;
  document.getElementById("move-item-name").innerText = name;
  document.getElementById("move-item-id").value = id;
  document.getElementById("move-item-modal").style.display = "block";
}

// Renamed function
function openModifyModal(id, currentName, currentQuantity) {
  document.getElementById("modify-item-id").value = id;
  document.getElementById("modify-item-name-old").innerText = currentName;
  document.getElementById("modify-item-name-new").value = currentName;
  document.getElementById("modify-item-quantity").value = currentQuantity || 1;

  document.getElementById("modify-item-modal").style.display = "block";
  document.getElementById("modify-item-name-new").focus();
}

// --- Bulk Action Handlers ---
function handleItemSelection(itemId, totalItems) {
  const index = selectedItems.indexOf(itemId);
  if (index > -1) selectedItems.splice(index, 1);
  else selectedItems.push(itemId);
  renderItems();
  updateBulkActionUI(totalItems);
}

function updateBulkActionUI(totalItems = 0) {
  const bulkMenu = document.getElementById("bulk-action-menu-wrapper");
  const titleHeader = document.getElementById("items-header-title");
  const countSpan = document.getElementById("bulk-selected-count");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const addItemBtn = document.getElementById("add-item-btn");

  if (selectedItems.length > 0) {
    // ---- Show the Bulk UI ----
    titleHeader.classList.add("hidden");
    countSpan.classList.remove("hidden");
    bulkMenu.classList.remove("hidden");
    addItemBtn.classList.add("hidden"); // Hide the "+" button

    countSpan.innerText = `${selectedItems.length} selected`;
    selectAllCheckbox.checked = selectedItems.length === totalItems;
  } else {
    // ---- Show the Normal Header ----
    titleHeader.classList.remove("hidden");
    countSpan.classList.add("hidden");
    bulkMenu.classList.add("hidden");
    addItemBtn.classList.remove("hidden"); // Show the "+" button

    selectAllCheckbox.checked = false;
  }
}

async function handleSelectAll() {
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const allItemNodes = document.querySelectorAll("#items-list li");

  if (selectAllCheckbox.checked) {
    const allItemIds = [];
    allItemNodes.forEach((li) => {
      allItemIds.push(li.getAttribute("data-id"));
    });
    selectedItems = allItemIds;
  } else {
    selectedItems = [];
  }
  renderItems();
  updateBulkActionUI(allItemNodes.length);
}

async function handleBulkMove() {
  if (selectedItems.length === 0) {
    alert("Please select items to move.");
    return;
  }
  const select = document.getElementById("bulk-move-place-select");
  select.innerHTML = "";
  allPlacesCache.forEach((place) => {
    select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
  });
  document.getElementById(
    "bulk-move-count"
  ).innerText = `${selectedItems.length}`;
  document.getElementById("bulk-move-modal").style.display = "block";
}

async function handleSaveBulkMove() {
  const toPlaceId = document.getElementById("bulk-move-place-select").value;
  if (!toPlaceId) {
    alert("Could not find a place to move to.");
    return;
  }
  console.log(`Bulk moving ${selectedItems.length} items to ${toPlaceId}`);

  const { error } = await supabaseClient
    .from("items")
    .update({ place_id: toPlaceId })
    .in("id", selectedItems);

  if (error) {
    console.error("Error bulk moving items:", error);
    alert("Error moving items: " + error.message);
    return;
  }
  logAction("bulk_move_items", {
    to_place_id: toPlaceId,
    metadata: { item_count: selectedItems.length, item_ids: selectedItems },
  });

  document.getElementById("bulk-move-modal").style.display = "none";
  selectedItems = [];
  renderItems();
  updateBulkActionUI();
}

async function handleBulkDelete() {
  if (
    !confirm(
      `Are you sure you want to delete ${selectedItems.length} items? This cannot be undone.`
    )
  ) {
    return;
  }
  console.log(`Deleting ${selectedItems.length} items...`);

  const { error } = await supabaseClient
    .from("items")
    .delete()
    .in("id", selectedItems);

  if (error) {
    console.error("Error bulk deleting items:", error);
    alert("Error deleting items: " + error.message);
    return;
  }
  logAction("bulk_delete_items", {
    metadata: { item_count: selectedItems.length, item_ids: selectedItems },
  });

  selectedItems = [];
  renderItems();
  updateBulkActionUI();
}

// --- Export Function ---
async function exportActionsToCSV() {
  // This is unchanged
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

// --- App Initialization (NEW) ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Check if the user is logged in
  // This is the most important step
  checkUserSession();
});
