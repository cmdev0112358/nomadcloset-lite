# NomadCloset Lite

A lightweight, open-source web app to track personal items across multiple places. Built with Vanilla JS and Supabase.

## Features

- **Multi-Page & Secure:** Full authentication with separate pages for login and the main app.
- **Create Places:** Define all the places you keep your things (e.g., Home, Office, Luggage).
- **Track Items:** Add items with names, quantities, and custom categories.
- **Move Items:** Easily move items between places, one at a time or in bulk.
- **Full CRUD:** Full Create, Read, Update, and Delete for items, places, and categories.
- **Advanced Filtering:** Filter by place, search by name, and sort by date or name.
- **Settings Page:** A dedicated page to manage your profile, places, and categories.
- **Data Export:** Export your entire action log as a CSV for analysis.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript (ES6+)
- **Backend:** Supabase (PostgreSQL Database, Auth with RLS)
- **Analysis:** Python (Pandas, Matplotlib) in a Jupyter Notebook
- **Hosting:** Deployed as a static site (GitHub Pages, Netlify, or Vercel).

---

## How to Run (Local)

### 1. Set up Supabase

1.  Go to [supabase.com](https://supabase.com), create a new project.
2.  In the **SQL Editor**, run the contents of `supabase/schema.sql` to create your tables.
3.  Go to **Authentication** > **Providers** and enable the **Email** provider.
4.  (Recommended) Turn **OFF** "Confirm email" for easy testing.
5.  Go to **Authentication** > **Policies**. Enable **Row Level Security (RLS)** for _all_ your tables (`items`, `places`, `categories`, `actions`).
6.  Go back to the **SQL Editor** and run the entire contents of `supabase/rls-policies.txt` to create the security policies.

### 2. Configure Frontend

1.  In your Supabase dashboard, go to **Project Settings** > **API**.
2.  Find your **Project URL** and your `anon` **public key**.
3.  In the `frontend/` directory, create a new file named `config.js`.
4.  Paste your URL and anon key into `frontend/config.js`:

    ```javascript
    // frontend/config.js
    export const SUPABASE_URL = "YOUR_SUPABASE_URL";
    export const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
    ```

### 3. Run the App Locally

Because the JavaScript uses ES Modules (`import`), you must run this from a local web server.

1.  **If using VS Code:**
    - Install the **"Live Server"** extension.
    - Right-click `frontend/login.html` and select **"Open with Live Server"**.
2.  **If using Python:**
    - `cd` into the project's _root_ directory.
    - Run `python -m http.server 8000`
    - Open `http://localhost:8000/frontend/login.html` in your browser.

The app will load. You can now sign up for a new account.

---

## How to Run the Analysis

1.  Make sure you have Python, VS Code, and the **Jupyter** and **Python** extensions installed.
2.  Use the app for a while to generate data.
3.  Click your user email > **"Export Log (CSV)"**.
4.  Save the downloaded `nomadcloset_actions_export.csv` into the `analysis/export_examples/` folder.
5.  Open the `analysis/analysis.ipynb` file in VS Code.
6.  Click the **"Run All" (▶▶)** button at the top to see the analysis.
