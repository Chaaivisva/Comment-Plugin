const API_BASE_URL = 'http://127.0.0.1:8000/api/';

// Keys written by login.js. Removed together on logout: the background
// worker's token lookup falls back to any long string in storage, so a
// leftover email could otherwise be mistaken for a token.
const SESSION_KEYS = ['authToken', 'username', 'email'];

document.addEventListener('DOMContentLoaded', async () => {
  const signedInAs = document.getElementById('signed-in-as');
  const usernameEl = document.getElementById('username');
  const emailEl = document.getElementById('email');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const logoutBtn = document.getElementById('logout-btn');

  const { authToken, username, email } = await chrome.storage.local.get(SESSION_KEYS);
  if (!authToken) {
    window.location.replace('login.html');
    return;
  }

  if (username) {
    signedInAs.textContent = `Signed in as ${username}.`;
    usernameEl.textContent = username;
  }
  if (email) emailEl.textContent = email;

  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(SESSION_KEYS);
    window.location.replace('login.html');
  });

  // Check that the backend is reachable and the stored token is still valid.
  try {
    const resp = await fetch(`${API_BASE_URL}comments/?page_url=${encodeURIComponent('about:blank')}`, {
      headers: { Authorization: `Token ${authToken}` },
    });
    if (resp.status === 401) {
      statusDot.className = 'dot offline';
      statusText.textContent = 'Your session has expired. Log out and sign in again.';
    } else if (resp.ok) {
      statusDot.className = 'dot';
      statusText.textContent = 'Connected to http://127.0.0.1:8000/api/';
    } else {
      statusDot.className = 'dot offline';
      statusText.textContent = `Backend responded with HTTP ${resp.status}.`;
    }
  } catch {
    statusDot.className = 'dot offline';
    statusText.textContent = 'Backend not reachable. Start the Django server on 127.0.0.1:8000.';
  }
});
