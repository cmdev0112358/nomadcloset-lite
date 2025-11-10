import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Handles the user Sign Up form.
 */
async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const authMessage = document.getElementById("auth-message");
  authMessage.innerText = "Signing up...";

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error signing up: " + error.message;
    authMessage.classList.remove("success");
    return;
  }

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    // This is a "recover" case, also an error
    authMessage.innerText = "Error: This email already exists.";
    authMessage.classList.remove("success");
  } else if (data.session) {
    // "Confirm Email" is OFF. User is logged in.
    authMessage.innerText = "Sign up successful! Logging you in...";
    authMessage.classList.add("success");
    window.location.href = "index.html"; // Redirect to the app
  } else {
    // "Confirm Email" is ON. User is NOT logged in.
    // Redirect to login page with a message!
    window.location.href = "login.html?message=check-email";
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
  authMessage.innerText = "Logging in...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    authMessage.innerText = "Error logging in: " + error.message;
    authMessage.classList.remove("success"); // Make sure it's red
    return;
  }

  // Login successful, redirect to the app
  authMessage.innerText = "";
  window.location.href = "index.html";
}

/**
 * Sets up listeners for the auth forms (login, signup, links).
 */
function setupAuthListeners() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document
    .getElementById("signup-form")
    .addEventListener("submit", handleSignUp);

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

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Set up listeners
  setupAuthListeners();

  // 2. NEW: Check for URL messages
  const urlParams = new URLSearchParams(window.location.search);
  const message = urlParams.get("message");
  const authMessage = document.getElementById("auth-message");

  if (message === "check-email") {
    authMessage.innerText =
      "Sign up successful! Please check your email to confirm your account.";
    authMessage.classList.add("success"); // Make it green
  }

  // 3. Check if user is ALREADY logged in
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      // If user is already logged in, send them straight to the app
      window.location.href = "index.html";
    } else {
      // Not logged in, make the page visible
      document.body.style.visibility = "visible";
    }
  });
});
