# Privacy & Data Policy

NomadCloset is designed to be privacy-first.

## Data We Collect

This application collects two types of data, which are stored in your personal Supabase database:

1.  **Application Data:** This is the data you actively create:

    - The names of your **Places** (e.g., "Home," "Luggage")
    - The names and quantities of your **Items** (e.g., "Socks (x6)")
    - Your **Categories** (e.g., "Clothing," "Tech")

2.  **Action Log Data:** To power the analytics, the app logs your actions:
    - `create_item`, `create_place`, `move_item`, `delete_item`
    - Anonymized `user_id` (a random UUID from Supabase Auth)
    - `session_id` (a random string for your browser session)

## Data We DO NOT Collect

- We **do not** collect any personal identifying information (PII) other than the email you use to sign up.
- We **do not** use cookies for tracking, only for session management (via Supabase).
- Your email is stored securely in Supabase's private `auth.users` table and is **never** included in data exports or shared.

## Your Data is Your Own

- All data is stored in **your own Supabase project**, which you control.
- The Row Level Security (RLS) policies are set up to be **maximally restrictive**: you can _only_ see and write your own data.
- The data you export in the CSV is for **your analysis only**.
- You can request your account be deleted at any time via the "Delete Account" button in the Profile settings.
