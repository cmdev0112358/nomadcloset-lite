import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// --- Configuration ---
let CURRENT_USER_ID = null;
let CURRENT_SESSION_ID = '';
let ACTIVE_PLACE_ID = 'all'; // 'all' by default

// --- Supabase Client ---
// The global 'supabase' object comes from the CDN script in index.html
// We create our own client variable with a *different name* to avoid conflict.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// --- Database Wrapper (Supabase) ---
const db = {

    auth: async () => {
        // 1. Check for an existing session in localStorage
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        let currentUser = null;

        if (sessionError) {
             console.error('Error getting session:', sessionError);
             document.body.innerHTML = '<h1>Error connecting to database. Please check console.</h1>';
             throw sessionError; // Throw error to stop init
        }

        if (session) {
            // User already has a session (from a previous visit)
            console.log('Found existing session:', session.user);
            currentUser = session.user;
        } else {
            // No session found, sign in anonymously
            console.log('No session found, signing in anonymously...');
            const { data: anonData, error: anonError } = await supabaseClient.auth.signInAnonymously();
            
            if (anonError) {
                console.error('Error signing in anonymously:', anonError);
                document.body.innerHTML = '<h1>Error connecting to database. Please check console.</h1>';
                throw anonError; // Throw error to stop init
            }
            console.log('Anonymous auth successful:', anonData.user);
            currentUser = anonData.user;
        }
        
        // This user_id will now be the same on every reload
        CURRENT_USER_ID = currentUser.id;

        // Set session ID for action logging
        CURRENT_SESSION_ID = `sess_${Date.now()}`;
        document.getElementById('session-id-display').innerText = CURRENT_SESSION_ID;

        // Check if this is a new user
        await db.initDefaultPlaces();
    },

    initDefaultPlaces: async () => {
        // Check if the user already has places
        const { data, error } = await supabaseClient
            .from('places')
            .select('id')
            .eq('user_id', CURRENT_USER_ID)
            .limit(1);

        if (error) console.error('Error checking for places:', error);

        // If no places exist, create the defaults
        if (data && data.length === 0) {
            console.log('No places found, creating defaults...');
            const defaultPlaces = [
                { name: 'Casa Uni', user_id: CURRENT_USER_ID },
                { name: 'Casa Genitori', user_id: CURRENT_USER_ID },
                { name: 'Valigia', user_id: CURRENT_USER_ID }
            ];
            
            const { error: insertError } = await supabaseClient.from('places').insert(defaultPlaces);
            if (insertError) console.error('Error creating default places:', insertError);

            // Log the creation (best effort)
            defaultPlaces.forEach(place => {
                logAction('create_place', { place_id: null, place_name: place.name });
            });
        }
    },

    getPlaces: async () => {
        const { data, error } = await supabaseClient
            .from('places')
            .select('*')
            .eq('user_id', CURRENT_USER_ID);
        if (error) console.error('Error fetching places:', error);
        return data || [];
    },

    getItems: async () => {
        const { data, error } = await supabaseClient
            .from('items')
            .select('*, places(name)') // Join to get place name
            .eq('user_id', CURRENT_USER_ID);
        if (error) console.error('Error fetching items:', error);
        return data || [];
    },

    getPlaceName: (placeId, allPlaces) => {
        if (!placeId) return 'N/A';
        const place = allPlaces.find(p => p.id === placeId);
        return place ? place.name : 'Unknown';
    }
};

// --- Action Logger ---
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
    
    // Handle specific action fields
    if (action_type === 'create_item') {
        newAction.to_place_id = data.place_id;
    }
    if (action_type === 'create_place') {
        newAction.to_place_id = data.place_id;
        newAction.item_name = data.place_name;
    }

    const { error } = await supabaseClient.from('actions').insert(newAction);
    if (error) console.error('Error logging action:', error);
    else console.log('Action Logged:', newAction);
}

// --- Render Functions ---
let allPlacesCache = []; // Cache places for rendering item lists

async function renderPlaces() {
    const places = await db.getPlaces();
    allPlacesCache = places; // Update cache
    const ul = document.getElementById('places-list');
    ul.innerHTML = `<li data-id="all" class="${ACTIVE_PLACE_ID === 'all' ? 'active' : ''}">All Items</li>`;
    
    places.forEach(place => {
        ul.innerHTML += `<li data-id="${place.id}" class="${ACTIVE_PLACE_ID === place.id ? 'active' : ''}">${place.name}</li>`;
    });

    // Add click listeners
    ul.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            ACTIVE_PLACE_ID = li.getAttribute('data-id');
            renderPlaces(); // Re-render places to show active state
            renderItems(); // Re-render items for the selected place
        });
    });

    updatePlaceDropdowns(places);
}

async function renderItems() {
    const items = await db.getItems();
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
        // Use joined place name if available, otherwise use cache
        const placeName = item.places ? item.places.name : db.getPlaceName(item.place_id, allPlacesCache);
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

    // Add move button listeners
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
        select.innerHTML = ''; // Clear existing options
        places.forEach(place => {
            select.innerHTML += `<option value="${place.id}">${place.name}</option>`;
        });
    });
}

// --- Modal Handling ---
function setupModals() {
    // Generic open/close
    document.querySelectorAll('.modal').forEach(modal => {
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.onclick = () => { modal.style.display = 'none'; };
    });
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };

    // --- Add Place Modal ---
    const addPlaceModal = document.getElementById('add-place-modal');
    document.getElementById('add-place-btn').onclick = () => {
        addPlaceModal.style.display = 'block';
        document.getElementById('new-place-name').focus();
    };
    document.getElementById('save-place-btn').onclick = async () => {
        const name = document.getElementById('new-place-name').value;
        if (!name) return alert('Please enter a name.');

        const newPlace = {
            name: name,
            user_id: CURRENT_USER_ID
        };
        
        const { data, error } = await supabaseClient.from('places').insert(newPlace).select();
        
        if (error) {
            alert('Error creating place: ' + error.message);
            return;
        }

        logAction('create_place', { place_id: data[0].id, place_name: data[0].name });
        
        document.getElementById('new-place-name').value = '';
        addPlaceModal.style.display = 'none';
        renderPlaces(); // This will also update dropdowns
    };

    // --- Add Item Modal ---
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

        const newItem = {
            name: name,
            category: category,
            place_id: place_id,
            user_id: CURRENT_USER_ID
        };

        const { data, error } = await supabaseClient.from('items').insert(newItem).select();

        if (error) {
            alert('Error creating item: ' + error.message);
            return;
        }

        logAction('create_item', { item_id: data[0].id, item_name: data[0].name, place_id: data[0].place_id });
        
        document.getElementById('new-item-name').value = '';
        document.getElementById('new-item-category').value = '';
        addItemModal.style.display = 'none';
        renderItems();
    };

    // --- Move Item Modal ---
    document.getElementById('save-move-btn').onclick = async () => {
        const itemId = document.getElementById('move-item-id').value;
        const toPlaceId = document.getElementById('move-item-place').value;
        
        const { data: itemData, error: findError } = await supabaseClient
            .from('items')
            .select('name, place_id')
            .eq('id', itemId)
            .single();

        if (findError) return alert('Item not found.');
        
        const fromPlaceId = itemData.place_id;
        if (fromPlaceId === toPlaceId) {
             document.getElementById('move-item-modal').style.display = 'none';
             return; // No change, just close modal
        }

        const { data, error } = await supabaseClient
            .from('items')
            .update({ place_id: toPlaceId })
            .eq('id', itemId);

        if (error) {
            // This is the corrected line
            alert('Error moving item: ' + error.message);
            return;
        }

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
    // Pre-select a *different* place
    const targetSelect = document.getElementById('move-item-place');
    const firstDifferentPlace = allPlacesCache.find(p => p.id !== fromId);
    if (firstDifferentPlace) {
        targetSelect.value = firstDifferentPlace.id;
    }

    document.getElementById('move-item-name').innerText = name;
    document.getElementById('move-item-id').value = id;
    document.getElementById('move-item-modal').style.display = 'block';
}

// --- Export Function ---
async function exportActionsToCSV() {
    const { data: actions, error } = await supabaseClient
        .from('actions')
        .select('*')
        .eq('user_id', CURRENT_USER_ID);

    if (error) return alert('Error fetching actions: ' + error.message);

    if (!actions || actions.length === 0) {
        alert('No actions to export.');
        return;
    }

    const headers = Object.keys(actions[0]);
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += headers.join(",") + "\n";

    actions.forEach(row => {
        const values = headers.map(header => {
            let val = row[header];
            // Anonymize user_id in the export (even though it's a UUID)
            if (header === 'user_id') {
                val = `user_${val.substring(0, 8)}`;
            }
            if (typeof val === 'string') {
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
    
    logAction('export_csv', { metadata: { rows: actions.length } });
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authenticate (anonymously)
    await db.auth();
    
    // 2. Setup UI
    setupModals();
    document.getElementById('export-csv-btn').addEventListener('click', exportActionsToCSV);

    // 3. Initial Render
    // db.auth() already called initDefaultPlaces
    await renderPlaces();
    await renderItems();
});