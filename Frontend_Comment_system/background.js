// background.js (Manifest V3 service worker)
'use strict';

function openExtensionPageTab(page = 'login.html') {
  try {
    const url = chrome.runtime.getURL(page);
    chrome.tabs.create({ url });
  } catch (err) {
    console.error('openExtensionPageTab error', err);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // There is no separate dashboard page yet, so always open the login page.
    openExtensionPageTab('login.html');
  } catch (err) {
    console.error('action.onClicked error', err);
    openExtensionPageTab('login.html');
  }
});

// Message listener (GET_AUTH_TOKEN, OPEN_LOGIN, API_REQUEST, KEEP_ALIVE)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || !message.type) return;

    if (message.type === 'OPEN_LOGIN') {
      // Always open the login page in a new tab (preferred).
      openExtensionPageTab('login.html');
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'GET_AUTH_TOKEN') {
      chrome.storage.local.get(null, (items) => {
        const keys = ['authToken', 'token', 'accessToken', 'auth_token', 'jwt', 'sessionToken', 'sessionid'];
        let found = null, foundKey = null;
        if (items) {
          for (const k of keys) {
            if (items[k]) { found = items[k]; foundKey = k; break; }
          }
        }
        // fallback heuristic
        if (!found && items) {
          for (const k of Object.keys(items)) {
            const v = items[k];
            if (typeof v === 'string' && v.length > 20) { found = v; foundKey = k; break; }
          }
        }
        sendResponse({ authToken: found || null, key: foundKey || null });
      });
      return true; // async
    }

    if (message.type === 'KEEP_ALIVE') {
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === 'API_REQUEST') {
      (async () => {
        try {
          const { url, options } = message;
          if (!url) {
            sendResponse({ success: false, error: 'Missing url' });
            return;
          }
          const resp = await fetch(url, options || {});
          const text = await resp.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text; }
          sendResponse({ success: true, data, status: resp.status });
        } catch (err) {
          console.error('API_REQUEST error', err);
          sendResponse({ success: false, error: err.message || String(err) });
        }
      })();
      return true;
    }

  } catch (err) {
    console.error('runtime.onMessage top-level error', err);
  }
});
