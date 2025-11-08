import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// --- Configuration ---
let CURRENT_USER_ID = null;
let CURRENT_SESSION_ID = '';
let ACTIVE_PLACE_ID = 'all'; // 'all' by default
let allPlacesCache = []; // Cache places for rendering item lists

// --- Supabase Client ---
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- UI Elements ---
const appContainer = document.getElementById('app-container');
const authContainer = document.getElementById('auth-container');
const appControls = document.getElementById('app-controls');
const logoutBtn = document.getElementById('logout-btn');
const sessionIdDisplay = document.getElementById('session-id-display');

// --- Auth Functions (NEW) ---

/**
 * Checks for an existing user session.
 * If found, initializes the app.
 * If not, shows the login/signup forms.
 */
async function checkUserSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error) {
        console.error('Error getting session:', error);
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
    console.log('User logged in:', user.email);
    CURRENT_USER_ID = user.id;
    CURRENT_SESSION_ID = `sess_${Date.now()}`;
    
    // Show user email and logout button
    sessionIdDisplay.innerText = user.email;
    logoutBtn.classList.remove('hidden');

    // Show app, hide auth
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    appControls.classList.remove('hidden');

    // Check for default places (same as before)
    await initDefaultPlaces();
    
    // Setup main app UI
    setupModals(); // This is our existing function
    document.getElementById('export-csv-btn').addEventListener('click', exportActionsToCSV);

    // Initial Render
    await renderPlaces();
    await renderItems();
}

/**
 * Shows the login/signup forms.
 */
function showAuthUI() {
    console.log('No user session, showing Auth UI.');
    // Hide app, show auth
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    appControls.classList.add('hidden');

    // Clear user display and hide logout
    sessionIdDisplay.innerText = "Logged Out";
    logoutBtn.classList.add('hidden');
}

/**
 * Handles the user Sign Up form.
 */
async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const authMessage = document.getElementById('auth-message');

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        authMessage.innerText = 'Error signing up: ' + error.message;
        return;
    }

    // Check your Supabase project settings.
    // If "Confirm email" is ON, show this message.
    authMessage.innerText = 'Sign up successful! Please check your email to confirm.';
    // If "Confirm email" is OFF, the user is logged in. We can auto-login them.
    if (data.user) {
         authMessage.innerText = 'Sign up successful! Logging you in...';
         initializeApp(data.user);
    }
}

/**
 * Handles the user Log In form.
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const authMessage = document.getElementById('auth-message');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        authMessage.innerText = 'Error logging in: ' + error.message;
        return;
    }

    // Login successful, initialize the app
    authMessage.innerText = '';
    initializeApp(data.user);
}

/**
 * Handles the user Log Out button.
 */
async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    
    if (error) {
        console.error('Error logging out:', error);
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
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignUp);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Toggle between login and signup forms
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        document.getElementById('auth-message').innerText = '';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('auth-message').innerText = '';
    });
}


// --- Database & App Functions (Mostly Unchanged) ---

/**
 * Checks if a new user needs default places created.
 * (This is the same function as before)
 */
async function initDefaultPlaces() {
    const { data, error } = await supabaseClient
        .from('places')
        .select('id')
        .eq('user_id', CURRENT_USER_ID)
        .limit(1);

    if (error) console.error('Error checking for places:', error);

    if (data && data.length === 0) {
        console.log('No places found, creating defaults...');
        const defaultPlaces = [
            { name: 'Casa Uni', user_id: CURRENT_USER_ID },
            { name: 'Casa Genitori', user_id: CURRENT_USER_ID },
            { name: 'Valigia', user_id: CURRENT_USER_ID }
        ];
        
        const { error: insertError } = await supabaseClient.from('places').insert(defaultPlaces);
        if (insertError) console.error('Error creating default places:', insertError);

        defaultPlaces.forEach(place => {
            logAction('create_place', { place_name: place.name });
        });
    }
}

async function getPlaces() {
    const { data, error } = await supabaseClient
        .from('places')
        .select('*')
        .eq('user_id', CURRENT_USER_ID);
    if (error) console.error('Error fetching places:', error);
    return data || [];
}

async function getItems() {
    const { data, error } = await supabaseClient
        .from('items')
        .select('*, places(name)') // Join to get place name
        .eq('user_id', CURRENT_USER_ID);
    if (error) console.error('Error fetching items:', error);
    return data || [];
}

function getPlaceName(placeId, allPlaces) {
    if (!placeId) return 'N/A';
    const place = allPlaces.find(p => p.id === placeId);
    return place ? place.name : 'Unknown';
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
        created_at: new Date().toISOString()
    };
    
    if (action_type === 'create_item') {
        newAction.to_place_id = data.place_id;
    }
    if (action_type === 'create_place') {
        // We need the ID from the DB, so this log is slightly different.
        // Let's just log the name.
        newAction.item_name = data.place_name;
    }

    const { error } = await supabaseClient.from('actions').insert(newAction);
    if (error) console.error('Error logging action:', error);
    else console.log('Action Logged:', newAction);
}

// --- Render Functions (Unchanged) ---
async function renderPlaces() {
    const places = await getPlaces();
    allPlacesCache = places; // Update cache
    const ul = document.getElementById('places-list');
    ul.innerHTML = `<li data-id="all" class="${ACTIVE_PLACE_ID === 'all' ? 'active' : ''}">All Items</li>`;
    
    places.forEach(place => {
        ul.innerHTML += `<li data-id="${place.id}" class="${ACTIVE_PLACE_ID === place.id ? 'active' : ''}">${place.name}</li>`;
    });

    ul.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            ACTIVE_PLACE_ID = li.getAttribute('data-id');
            renderPlaces(); 
            renderItems(); 
        });
    });
    updatePlaceDropdowns(places);
}

async function renderItems() {
    const items = await getItems();
    const ul = document.getElementById('items-list');
    ul.innerHTML = '';

    const filteredItems = (ACTIVE_PLACE_ID === 'all')
        ? items
        : items.filter(item => item.place_id === ACTIVE_PLACE_ID);

    if (filteredItems.length === 0) {
        ul.innerHTML = '<li>No items found in this place.</li>';
        return;
    }

    filteredItems.forEach(item => {
        const placeName = item.places ? item.places.name : getPlaceName(item.place_id, allPlacesCache);
        ul.innerHTML += `
            <li data-id="${item.id}">
                <div class="item-info">
                    <strong>${item.name}</strong> (${placeName})
                    <span class="item-category">${item.category || ''}</span>
                </div>
                <button class="move-btn" data-id="${item.id}" data-name="${item.name}" data-from-id="${item.place_id}">Move</button>
            </li>
        `;
    });

    ul.querySelectorAll('.move-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            const name = e.target.getAttribute('data-name');
            const fromId = e.target.getAttribute('data-from-id');
            openMoveModal(id, name, fromId);
        });
    });
}

function updatePlaceDropdowns(places) {
    if (!places) places = allPlacesCache;
    const selects = [
        document.getElementById('new-item-place'),
        document.getElementById('move-item-place')
    ];

    selects.forEach(select => {
        select.innerHTML = '';
        places.forEach(place => {
            select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
        });
    });
}

// --- Modal Handling (Unchanged, but one fix in save-place) ---
function setupModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.onclick = () => { modal.style.display = 'none'; };
    });
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };

    const addPlaceModal = document.getElementById('add-place-modal');
    document.getElementById('add-place-btn').onclick = () => {
        addPlaceModal.style.display = 'block';
        document.getElementById('new-place-name').focus();
    };
    document.getElementById('save-place-btn').onclick = async () => {
        const name = document.getElementById('new-place-name').value;
        if (!name) return alert('Please enter a name.');

        const newPlace = { name: name, user_id: CURRENT_USER_ID };
        const { data, error } = await supabaseClient.from('places').insert(newPlace).select();
        
        if (error) { alert('Error creating place: ' + error.message); return; }

        // Log action
        logAction('create_place', { place_id: data[0].id, place_name: data[0].name });
        
        document.getElementById('new-place-name').value = '';
        addPlaceModal.style.display = 'none';
        renderPlaces();
    };

    const addItemModal = document.getElementById('add-item-modal');
    document.getElementById('add-item-btn').onclick = () => {
        addItemModal.style.display = 'block';
        document.getElementById('new-item-name').focus();
    };
    document.getElementById('save-item-btn').onclick = async () => {
        const name = document.getElementById('new-item-name').value;
        const category = document.getElementById('new-item-category').value;
        const place_id = document.getElementById('new-item-place').value;
        if (!name || !place_id) return alert('Name and place are required.');

        const newItem = { name: name, category: category, place_id: place_id, user_id: CURRENT_USER_ID };
        const { data, error } = await supabaseClient.from('items').insert(newItem).select();

        if (error) { alert('Error creating item: ' + error.message); return; }

        logAction('create_item', { item_id: data[0].id, item_name: data[0].name, place_id: data[0].place_id });
        
        document.getElementById('new-item-name').value = '';
        document.getElementById('new-item-category').value = '';
        addItemModal.style.display = 'none';
        renderItems();
    };

    document.getElementById('save-move-btn').onclick = async () => {
        const itemId = document.getElementById('move-item-id').value;
        const toPlaceId = document.getElementById('move-item-place').value;
        
        const { data: itemData, error: findError } = await supabaseClient
            .from('items').select('name, place_id').eq('id', itemId).single();

        if (findError) return alert('Item not found.');
        
        const fromPlaceId = itemData.place_id;
        if (fromPlaceId === toPlaceId) {
             document.getElementById('move-item-modal').style.display = 'none';
             return; 
        }

        const { error } = await supabaseClient
            .from('items').update({ place_id: toPlaceId }).eq('id', itemId);

        if (error) { alert('Error moving item: ' + error.message); return; }

        logAction('move_item', {
            item_id: itemId,
            item_name: itemData.name,
            from_place_id: fromPlaceId,
            to_place_id: toPlaceId
        });
        
        document.getElementById('move-item-modal').style.display = 'none';
        renderItems();
    };
}

function openMoveModal(id, name, fromId) {
    const targetSelect = document.getElementById('move-item-place');
    const firstDifferentPlace = allPlacesCache.find(p => p.id !== fromId);
    if (firstDifferentPlace) {
        targetSelect.value = firstDifferentPlace.id;
    }
    document.getElementById('move-item-name').innerText = name;
    document.getElementById('move-item-id').value = id;
    document.getElementById('move-item-modal').style.display = 'block';
}

// --- Export Function (Unchanged) ---
async function exportActionsToCSV() {
    const { data: actions, error } = await supabaseClient
        .from('actions').select('*').eq('user_id', CURRENT_USER_ID);

    if (error) return alert('Error fetching actions: ' + error.message);
    if (!actions || actions.length === 0) { alert('No actions to export.'); return; }

    const headers = Object.keys(actions[0]);
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += headers.join(",") + "\n";

    actions.forEach(row => {
        const values = headers.map(header => {
            let val = row[header];
            if (header === 'user_id') { val = `user_${val.substring(0, 8)}`; }
            if (typeof val === 'string') { val = '"' + val.replace(/"/g, '""') + '"'; }
            else if (val === null) { val = '""'; }
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
    
    logAction('export_csv', { metadata: { rows: actions.length } });
}

// --- App Initialization (NEW) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set up listeners for the Login/Signup forms
    setupAuthListeners();
    
    // 2. Check if the user is already logged in
    checkUserSession();
});