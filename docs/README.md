# NomadCloset Lite

A lightweight open-source web app to track personal items across multiple places, backed by Supabase.

## How to Run (Local + Supabase)

This project requires a Supabase backend to function.

### 1. Set up Supabase

1.  Go to [supabase.com](https://supabase.com), create a new project.
2.  In your Supabase dashboard, go to the **SQL Editor**.
3.  Run the contents of `supabase/schema.sql` to create your tables.
4.  Go to **Authentication** > **Policies**. Enable **Row Level Security (RLS)** for the `users`, `places`, `items`, and `actions` tables.
5.  Go back to the **SQL Editor** and run the entire contents of `supabase/rls-policies.txt` to create the security policies. This *only* allows users to access their own data.

### 2. Configure Frontend

1.  In your Supabase dashboard, go to **Project Settings** > **API**.
2.  Find your **Project URL** and your `anon` **public key**.
3.  In the `frontend/` directory, copy `config.example.js` to a new file named `config.js`. (If `config.example.js` doesn't exist, just create `config.js`).
4.  Paste your URL and anon key into `frontend/config.js`:

    ```javascript
    // frontend/config.js
    export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
    export const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
    ```

### 3. Run the App Locally

Because the JavaScript uses ES Modules (`import`), you must run this from a local web server.

1.  **If using VS Code:**
    * Install the **"Live Server"** extension.
    * Right-click `frontend/index.html` and select **"Open with Live Server"**.
2.  **If using Python:**
    * `cd` into the project's *root* directory.
    * Run `python -m http.server 8000`
    * Open `http://localhost:8000/frontend/` in your browser.
3.  **If using Node.js:**
    * `cd` into the project's *root* directory.
    * Install a simple server: `npm install -g serve`
    * Run `serve`
    * Open `http://localhost:3000/frontend/` in your browser.

The app will load, automatically create an anonymous user, and save all data to your Supabase project.