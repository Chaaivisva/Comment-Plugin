// plugin.js (content script) — robust token discovery, anchoring and restore
'use strict';

/* ===== CONFIG ===== */
const API_BASE_URL = 'http://127.0.0.1:8000/api/'; // adjust to your API

/* ===== helpers ===== */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function safeSendMessage(message, opts = {}) {
  const attempts = opts.attempts || 4;
  const delayMs = opts.delayMs || 250;
  const timeoutMs = opts.timeoutMs || 5000;
  let lastErr = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        let done = false;
        try {
          if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
            reject(new Error('chrome.runtime.sendMessage not available'));
            return;
          }
          chrome.runtime.sendMessage(message, (resp) => {
            done = true;
            if (chrome.runtime && chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message || 'runtime.lastError'));
            else resolve(resp);
          });
        } catch (err) { reject(err); }
        setTimeout(() => { if (!done) reject(new Error('sendMessage timeout')); }, timeoutMs);
      });
      return res;
    } catch (err) {
      lastErr = err;
      const em = String(err && err.message || '').toLowerCase();
      if (em.includes('extension context invalidated') || em.includes('not available') || em.includes('timeout')) {
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('safeSendMessage failed after retries');
}

function chromeStorageLocalGet(keys) {
  return new Promise(resolve => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== 'function') {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, items => {
        if (chrome.runtime && chrome.runtime.lastError) resolve({});
        else resolve(items || {});
      });
    } catch (e) { resolve({}); }
  });
}
function chromeStorageSyncGet(keys) {
  return new Promise(resolve => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync || typeof chrome.storage.sync.get !== 'function') {
        resolve({});
        return;
      }
      chrome.storage.sync.get(keys, items => {
        if (chrome.runtime && chrome.runtime.lastError) resolve({});
        else resolve(items || {});
      });
    } catch (e) { resolve({}); }
  });
}

async function waitForChromeStorageLocal(max = 8, delay = 120) {
  for (let i = 0; i < max; i++) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function') return true;
    await sleep(delay);
  }
  return false;
}

/* ===== AUTH DISCOVERY ===== */
async function getAuthToken() {
  const candidateKeys = ['authToken', 'token', 'accessToken', 'auth_token', 'sessionToken', 'jwt', 'sessionid'];

  // 1) chrome.storage.local (wait and then read)
  try {
    await waitForChromeStorageLocal();
    const items = await chromeStorageLocalGet(null);
    if (items) {
      for (const k of candidateKeys) if (items[k]) return { token: items[k], source: `chrome.storage.local:${k}` };
      for (const k of Object.keys(items)) {
        const v = items[k];
        if (typeof v === 'string' && v.length > 20) return { token: v, source: `chrome.storage.local:${k}` };
      }
    }
  } catch (e) { console.debug('getAuthToken: storage.local read failed', e && e.message); }

  // 2) background GET_AUTH_TOKEN
  try {
    const resp = await safeSendMessage({ type: 'GET_AUTH_TOKEN' }, { attempts: 4, delayMs: 300, timeoutMs: 4000 }).catch(e => { throw e; });
    if (resp && resp.authToken) return { token: resp.authToken, source: `background:${resp.key || 'authToken'}` };
  } catch (e) { console.debug('getAuthToken: background GET_AUTH_TOKEN failed', e && e.message); }

  // 3) chrome.storage.sync
  try {
    const sitems = await chromeStorageSyncGet(null);
    if (sitems) {
      for (const k of candidateKeys) if (sitems[k]) return { token: sitems[k], source: `chrome.storage.sync:${k}` };
      for (const k of Object.keys(sitems)) {
        const v = sitems[k];
        if (typeof v === 'string' && v.length > 20) return { token: v, source: `chrome.storage.sync:${k}` };
      }
    }
  } catch (e) { console.debug('getAuthToken: storage.sync failed', e && e.message); }

  // 4) page local/session storage
  try {
    for (const k of candidateKeys) {
      try { const v = localStorage.getItem(k); if (v) return { token: v, source: `localStorage:${k}` }; } catch {}
      try { const v = sessionStorage.getItem(k); if (v) return { token: v, source: `sessionStorage:${k}` }; } catch {}
    }
  } catch (e) { /* ignore */ }

  // 5) cookies last resort
  try {
    const cookieString = document.cookie || '';
    const cookieCandidates = ['authToken', 'sessionid', 'jwt', 'token', 'accessToken', 'auth_token'];
    for (const name of cookieCandidates) {
      const m = cookieString.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
      if (m && m[1]) return { token: decodeURIComponent(m[1]), source: `cookie:${name}` };
    }
  } catch (e) { /* ignore */ }

  return { token: null, source: null };
}

async function openLogin() {
  // 1) ask background to open login page
  try {
    await safeSendMessage({ type: 'OPEN_LOGIN' }, { attempts: 4, delayMs: 250, timeoutMs: 3000 });
    return;
  } catch (err) { console.debug('openLogin: OPEN_LOGIN message failed', err && err.message); }

  // 2) try chrome.runtime.getURL
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      const url = chrome.runtime.getURL('login.html');
      try { window.open(url, '_blank'); return; } catch (e) { console.debug('openLogin: window.open failed', e && e.message); }
    }
  } catch (e) { console.debug('openLogin: getURL failed', e && e.message); }

  // 3) try chrome-extension://<id>/login.html
  try {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      const url = `chrome-extension://${chrome.runtime.id}/login.html`;
      try { window.open(url, '_blank'); return; } catch (e) { console.debug('openLogin: chrome-extension open failed', e && e.message); }
    }
  } catch (e) { console.debug('openLogin fallback failed', e && e.message); }

  // 4) final fallback - instruct user
  toast('Unable to open extension login page. Please open the extension (puzzle icon) and sign in.', 'warning', 6000);
}

/* ===== API (via background proxy) ===== */
async function callApi(endpoint, method = 'GET', data = null) {
  // check for token
  const initial = await getAuthToken();
  if (!initial.token) {
    try {
      const bg = await safeSendMessage({ type: 'GET_AUTH_TOKEN' }, { attempts: 3, delayMs: 300, timeoutMs: 3000 });
      if (!(bg && bg.authToken)) {
        toast('Please login to comment.', 'warning', 3000);
        await openLogin();
        return null;
      }
    } catch (err) {
      toast('Please login to comment.', 'warning', 3000);
      await openLogin();
      return null;
    }
  }

  const resolved = await getAuthToken();
  const token = resolved.token;
  if (!token) {
    toast('Please login to comment.', 'warning', 3000);
    await openLogin();
    return null;
  }

  const url = API_BASE_URL + endpoint;
  const options = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` } };
  if (data) options.body = JSON.stringify(data);

  try {
    const resp = await safeSendMessage({ type: 'API_REQUEST', url, options }, { attempts: 3, delayMs: 300, timeoutMs: 10000 });
    if (!resp) throw new Error('No response from background');
    if (!resp.success) {
      if (resp.status === 401) {
        try { chrome.storage.local.remove('authToken'); } catch {}
        toast('Your session expired. Please sign in again.', 'warning', 3200);
        await openLogin();
        return null;
      }
      throw new Error(resp.error || 'API request failed');
    }
    return resp.data;
  } catch (err) {
    console.error('callApi error', err);
    const em = String(err && err.message || '').toLowerCase();
    if (em.includes('extension context invalidated') || em.includes('timeout') || em.includes('not available')) {
      await openLogin();
      return null;
    }
    throw err;
  }
}

/* ===== SELECTION ANCHORING HELPERS ===== */
function getXPath(el) {
  if (!el) return '';
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === Node.ELEMENT_NODE && cur !== document.body && cur !== document.documentElement) {
    let ix = 0;
    let sib = cur.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && sib.nodeName === cur.nodeName) ix++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${cur.nodeName.toLowerCase()}[${ix+1}]`);
    cur = cur.parentNode;
  }
  parts.unshift('html','body');
  return '/' + parts.join('/');
}

function getCssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    let part = cur.nodeName.toLowerCase();
    if (cur.classList && cur.classList.length) {
      const cls = Array.from(cur.classList).slice(0,2).map(c => c.replace(/\s+/g,'')).join('.');
      part += `.${cls}`;
    }
    const parent = cur.parentNode;
    if (parent) {
      const children = Array.from(parent.children).filter(c => c.nodeName === cur.nodeName);
      if (children.length > 1) {
        const idx = Array.from(parent.children).indexOf(cur) + 1;
        part += `:nth-child(${idx})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentNode;
  }
  return parts.join(' > ');
}

function computeRangeIndicesInContainer(range, container) {
  try {
    const before = document.createRange();
    before.selectNodeContents(container);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;

    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(container);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const end = beforeEnd.toString().length;

    return { start, end };
  } catch (err) {
    console.warn('computeRangeIndicesInContainer failed', err);
    return null;
  }
}

/** Robust selection rect (viewport coords), prefers first client rect; falls back to bounding rect. */
function getSelectionViewportRect(range) {
  try {
    if (!range) return null;
    const rectList = Array.from(range.getClientRects()).filter(r => r && r.width && r.height);
    if (rectList.length) {
      const first = rectList[0];
      const left = Math.min(...rectList.map(r => r.left));
      const right = Math.max(...rectList.map(r => r.right));
      const top = Math.min(...rectList.map(r => r.top));
      const bottom = Math.max(...rectList.map(r => r.bottom));
      const union = { left, top, right, bottom, width: right-left, height: bottom-top,
                      centerX: left + (right-left)/2, centerY: top + (bottom-top)/2 };
      // Keep both: union for panel, "first" for bubble placement above text
      return { union, first };
    } else {
      const r = range.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return null;
      const base = { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                     width: r.width, height: r.height, centerX: r.left + r.width/2, centerY: r.top + r.height/2 };
      return { union: base, first: base };
    }
  } catch { return null; }
}

function getSelectionDetailsForSaving() {
  try {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const selectedText = (range.toString() || '').trim();
    if (!selectedText) return null;

    let ancestor = range.commonAncestorContainer;
    if (!ancestor) ancestor = document.body;
    if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
    if (!ancestor) ancestor = document.body;

    const containerXPath = getXPath(ancestor);
    const containerCss = getCssPath(ancestor);
    const containerText = ancestor.textContent || '';

    const indices = computeRangeIndicesInContainer(range, ancestor);
    let start_index = null, end_index = null;
    if (indices) { start_index = indices.start; end_index = indices.end; }
    else {
      const idx = containerText.indexOf(selectedText);
      start_index = idx >= 0 ? idx : 0;
      end_index = start_index + selectedText.length;
    }

    const prefixLen = 30, suffixLen = 30;
    const prefixStart = Math.max(0, start_index - prefixLen);
    const prefix = containerText.substring(prefixStart, start_index);
    const suffix = containerText.substring(end_index, Math.min(containerText.length, end_index + suffixLen));

    // selection rects (viewport coordinates)
    let rect = null;
    let bubbleRect = null;
    const r = getSelectionViewportRect(range);
    if (r) { rect = r.union; bubbleRect = r.first; }

    return {
      selected_text: selectedText,
      container_xpath: containerXPath,
      container_css: containerCss,
      start_index,
      end_index,
      prefix,
      suffix,
      page_url: window.location.href,
      rect,          // union rect (for panel placement / highlight)
      bubbleRect     // first line rect (for bubble placement)
    };
  } catch (err) {
    console.error('getSelectionDetailsForSaving error', err);
    return null;
  }
}

// Build Range from container + offsets (uses text nodes)
function createRangeFromContainerOffsets(container, startIndex, endIndex) {
  try {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    let cum = 0, startNode = null, startOff = 0, endNode = null, endOff = 0;
    for (let i = 0; i < textNodes.length; i++) {
      const tn = textNodes[i];
      const len = tn.textContent.length;
      if (!startNode && cum + len >= startIndex) {
        startNode = tn; startOff = Math.max(0, startIndex - cum);
      }
      if (!endNode && cum + len >= endIndex) {
        endNode = tn; endOff = Math.max(0, endIndex - cum);
        break;
      }
      cum += len;
    }
    if (!startNode || !endNode) return null;
    const r = document.createRange();
    r.setStart(startNode, startOff);
    r.setEnd(endNode, endOff);
    return r;
  } catch (err) {
    console.error('createRangeFromContainerOffsets error', err);
    return null;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// index using a whitespace-tolerant regex (handles multi spaces/newlines)
function indexOfLoose(containerText, needle) {
  try {
    const tokens = (needle || '').trim().split(/\s+/).map(t => escapeRegExp(t)).filter(Boolean);
    if (!tokens.length) return -1;
    const pattern = tokens.join('\\s+');
    const re = new RegExp(pattern, 'g');
    const m = re.exec(containerText);
    if (m && typeof m.index === 'number') return m.index;
    return -1;
  } catch (err) {
    console.debug('indexOfLoose error', err);
    return -1;
  }
}

function allIndexesOf(hay, needle) {
  const res = [];
  if (!needle) return res;
  let pos = 0;
  while (true) {
    const idx = hay.indexOf(needle, pos);
    if (idx === -1) break;
    res.push(idx); pos = idx + 1;
  }
  return res;
}

function normalizeWS(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

/* Find saved selection and return a Range or null */
function findSelectionOnPage(saved) {
  try {
    if (!saved || !saved.selected_text) return null;
    const sel = saved.selected_text;

    // 1) XPath container
    if (saved.container_xpath) {
      try {
        const node = document.evaluate(saved.container_xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (node) {
          const container = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          const ctext = container.textContent || '';
          if (typeof saved.start_index === 'number' && typeof saved.end_index === 'number') {
            const candidate = ctext.substring(saved.start_index, saved.end_index);
            if (normalizeWS(candidate) === normalizeWS(sel)) {
              const r = createRangeFromContainerOffsets(container, saved.start_index, saved.end_index);
              if (r) return r;
            }
          }
          const idxLoose = indexOfLoose(ctext, sel);
          if (idxLoose !== -1) {
            const r = createRangeFromContainerOffsets(container, idxLoose, idxLoose + sel.length);
            if (r) return r;
          }
          const idxPlain = ctext.indexOf(sel);
          if (idxPlain !== -1) {
            const r = createRangeFromContainerOffsets(container, idxPlain, idxPlain + sel.length);
            if (r) return r;
          }
        }
      } catch (err) { console.debug('findSelectionOnPage: xpath lookup failed', err); }
    }

    // 2) CSS selector container candidates
    if (saved.container_css) {
      try {
        const nodes = Array.from(document.querySelectorAll(saved.container_css));
        for (const node of nodes) {
          const ctext = node.textContent || '';
          const idxLoose = indexOfLoose(ctext, sel);
          if (idxLoose !== -1) {
            const r = createRangeFromContainerOffsets(node, idxLoose, idxLoose + sel.length);
            if (r) return r;
          }
          const idxPlain = ctext.indexOf(sel);
          if (idxPlain !== -1) {
            const r = createRangeFromContainerOffsets(node, idxPlain, idxPlain + sel.length);
            if (r) return r;
          }
        }
      } catch (err) { console.debug('findSelectionOnPage: css lookup failed', err); }
    }

    // 3) Try prefix/suffix guided search in document body
    try {
      const bodyText = document.body.textContent || '';
      let idx = indexOfLoose(bodyText, sel);
      if (idx !== -1) {
        const r = createRangeFromContainerOffsets(document.body, idx, idx + sel.length);
        if (r) return r;
      }
      idx = bodyText.indexOf(sel);
      if (idx !== -1) {
        const r = createRangeFromContainerOffsets(document.body, idx, idx + sel.length);
        if (r) return r;
      }
      if (saved.prefix || saved.suffix) {
        const ctx = (saved.prefix || '') + saved.selected_text + (saved.suffix || '');
        const idx2 = indexOfLoose(bodyText, ctx);
        if (idx2 !== -1) {
          const innerIdx = bodyText.indexOf(saved.selected_text, idx2);
          if (innerIdx !== -1) {
            const r = createRangeFromContainerOffsets(document.body, innerIdx, innerIdx + saved.selected_text.length);
            if (r) return r;
          }
        }
      }
    } catch (err) { console.debug('findSelectionOnPage: global body search failed', err); }

    return null;
  } catch (err) {
    console.error('findSelectionOnPage error', err);
    return null;
  }
}

/* ===== highlight + scroll helpers ===== */
let highlightOverlays = [];
function clearHighlights() { try { highlightOverlays.forEach(o => o.remove()); } catch (e) {} highlightOverlays = []; }
function createHighlightForRect(rect) {
  const ov = document.createElement('div');
  ov.style.position = 'absolute';
  ov.style.left = `${rect.left + window.scrollX}px`;   // absolute → document coords
  ov.style.top = `${rect.top + window.scrollY}px`;
  ov.style.width = `${rect.width}px`;
  ov.style.height = `${rect.height}px`;
  ov.style.background = 'rgba(91,140,255,0.22)';
  ov.style.borderRadius = '6px';
  ov.style.boxShadow = '0 6px 20px rgba(91,140,255,0.18)';
  ov.style.zIndex = '2147483645';
  ov.style.pointerEvents = 'none';
  document.documentElement.appendChild(ov);
  highlightOverlays.push(ov);
  return ov;
}
function highlightRange(range, ms = 3500) {
  clearHighlights();
  try {
    const rects = range.getClientRects();
    if (rects && rects.length) {
      for (let r of rects) createHighlightForRect(r);
    } else {
      const r2 = range.getBoundingClientRect();
      if (r2 && r2.width && r2.height) createHighlightForRect(r2);
    }
  } catch (e) { console.error('highlightRange error', e); }
  if (ms) setTimeout(clearHighlights, ms);
}
function scrollRangeIntoView(range) {
  try {
    const rect = range.getBoundingClientRect();
    // center in viewport
    const top = Math.max(0, window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2));
    window.scrollTo({ top, behavior: 'smooth' });
  } catch (e) { console.debug('scrollRangeIntoView failed', e); }
}

/* ===== UI (shadow DOM) ===== */
let shadowRoot, bubble, panel, ta, tagInput, submitBtn, closeBtn, headerBar, commentsContainer, toastHost, filterInput;

function ensureUI() {
  if (shadowRoot) return;

  const host = document.createElement('div');
  host.id = 'comment-plugin-host';
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);

  shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial} *{box-sizing:border-box}
    .bubble{position:fixed;transform:translate(-50%,0);background:#111827;color:#f9fafb;padding:8px 12px;border-radius:999px;font:600 13px/1.2 ui-sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.28);cursor:pointer;user-select:none;display:none;white-space:nowrap}
    .panel{position:fixed;width:360px;background:#0b1020;color:#e6ecff;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,0.5);display:none;overflow:hidden;resize:both}
    .header{background:#121a32;padding:12px;cursor:move;font:600 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06)}
    .body{padding:12px;display:grid;gap:12px}
    textarea,input{width:100%;padding:10px;border-radius:12px;background:#0e1530;color:#e6ecff;border:1px solid rgba(255,255,255,0.08);outline:none;font:14px}
    textarea{height:110px;resize:vertical}
    .actions{display:flex;gap:8px;justify-content:flex-end}
    .btn{border:0;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:600}
    .btn-close{background:#e5e7eb;color:#111827}
    .btn-primary{background:#5b8cff;color:white}
    .comments-container{margin-top:6px;padding:10px;background:#0e1530;border-radius:12px;max-height:280px;overflow:auto}
    .comment-item{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,0.04)}
    .comment-left{flex:1 1 auto;min-width:0}
    .comment-user{font-size:13px;font-weight:700;color:#5b8cff}
    .comment-selected-text{font-size:12px;color:#a8b0c0;font-style:italic;margin-top:6px}
    .comment-text{font-size:14px;color:#e6ecff;margin-top:8px;white-space:pre-wrap}
    .comment-actions{display:flex;flex-direction:column;gap:6px;flex:0 0 auto}
    .copy-btn,.go-btn{border:1px solid rgba(91,140,255,0.4);background:transparent;color:#e6ecff;border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer}
    .copy-btn:hover,.go-btn:hover{background:rgba(91,140,255,0.08)}
    .filter{display:flex;gap:8px;align-items:center}
    .toast-host{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;display:flex;flex-direction:column;gap:8px;z-index:2147483647}
    .toast{min-width:220px;background:#121a32;color:#e6ecff;padding:10px 12px;border-radius:12px}
    .token-badge{font-size:12px;color:#a8b0c0;margin-left:8px}
    .debug-btn{background:transparent;color:#a8b0c0;border:1px solid rgba(255,255,255,0.04);padding:6px 8px;border-radius:8px;cursor:pointer}
  `;
  shadowRoot.appendChild(style);

  // bubble
  bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = 'Comment'; shadowRoot.appendChild(bubble);

  // panel
  panel = document.createElement('form'); panel.className = 'panel'; panel.addEventListener('submit', e => e.preventDefault());
  headerBar = document.createElement('div'); headerBar.className = 'header';
  headerBar.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:999px;background:#5b8cff"></div><div style="font-weight:700">Add comment</div><div id="token-badge" class="token-badge">auth: checking…</div></div><div><button type="button" id="debug-dump" class="debug-btn">Dump storage</button></div>`;

  const body = document.createElement('div'); body.className = 'body';
  const commentRow = document.createElement('div'); commentRow.className = 'row';
  const commentLabel = document.createElement('div'); commentLabel.className = 'label'; commentLabel.textContent = 'Comment';
  ta = document.createElement('textarea'); ta.placeholder = 'Write your comment...'; commentRow.appendChild(commentLabel); commentRow.appendChild(ta);

  const tagRow = document.createElement('div'); tagRow.className = 'row';
  const tagLabel = document.createElement('div'); tagLabel.className = 'label'; tagLabel.textContent = 'Tag user email (optional)';
  tagInput = document.createElement('input'); tagInput.type = 'email'; tagInput.placeholder = 'recipient@example.com'; tagRow.appendChild(tagLabel); tagRow.appendChild(tagInput);

  const actions = document.createElement('div'); actions.className = 'actions';
  closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'btn btn-close'; closeBtn.textContent = 'Close'; closeBtn.addEventListener('click', hidePanel);
  submitBtn = document.createElement('button'); submitBtn.type = 'button'; submitBtn.className = 'btn btn-primary'; submitBtn.textContent = 'Comment'; submitBtn.addEventListener('click', onSubmit);
  actions.appendChild(closeBtn); actions.appendChild(submitBtn);

  const filterRow = document.createElement('div'); filterRow.className = 'filter';
  filterInput = document.createElement('input'); filterInput.type = 'text'; filterInput.placeholder = 'Filter comments (user/selection/text)…'; filterInput.addEventListener('input', () => filterComments(filterInput.value));
  filterRow.appendChild(filterInput);

  commentsContainer = document.createElement('div'); commentsContainer.className = 'comments-container';

  body.appendChild(commentRow);
  body.appendChild(tagRow);
  body.appendChild(actions);
  body.appendChild(filterRow);
  body.appendChild(commentsContainer);
  panel.appendChild(headerBar);
  panel.appendChild(body);
  shadowRoot.appendChild(panel);

  toastHost = document.createElement('div'); toastHost.className = 'toast-host'; shadowRoot.appendChild(toastHost);

  const debugBtn = shadowRoot.getElementById('debug-dump');
  debugBtn.addEventListener('click', async () => {
    try {
      const items = await chromeStorageLocalGet(null);
      console.log('chrome.storage.local dump:', items);
      const bg = await safeSendMessage({ type: 'GET_AUTH_TOKEN' }).catch(e => ({ error: String(e) }));
      console.log('background GET_AUTH_TOKEN:', bg);
      toast('Storage dumped to console (see DevTools) — check token keys.', 'ok', 4000);
      updateTokenBadge();
    } catch (e) {
      console.error('debug dump failed', e);
      toast('Failed to dump storage; check console.', 'error', 4000);
    }
  });

  bubble.addEventListener('click', () => {
    bubble.style.display = 'none';
    if (lastSelection && (lastSelection.rect || lastSelection.bubbleRect)) {
      const r = lastSelection.rect || lastSelection.bubbleRect;
      showPanelAtSelection(r);
    } else {
      showPanelCentered();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!shadowRoot) return;
    const path = e.composedPath();
    if (path.includes(bubble) || path.includes(panel)) return;
    hideBubble(); hidePanel();
  });

  makeDraggable(panel, headerBar);
}

/* ===== selection listener & bubble placement ===== */
let selTimer = null;
let lastSelection = null;

function handleMouseUp() {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    ensureUI();
    const details = getSelectionDetailsForSaving();
    if (!details) { hideBubble(); lastSelection = null; return; }
    lastSelection = details;
    if (details.bubbleRect) showBubbleAtRect(details.bubbleRect);
    safeSendMessage({ type: 'KEEP_ALIVE' }).catch(()=>{});
  }, 40);
}
document.addEventListener('mouseup', handleMouseUp);

// Hide bubble when selection collapses (keyboard or otherwise)
document.addEventListener('selectionchange', () => {
  const s = window.getSelection();
  if (!s || s.isCollapsed) { hideBubble(); }
});

// Hide bubble on scroll/resize (prevents stale positioning)
window.addEventListener('scroll', () => hideBubble(), { passive: true });
window.addEventListener('resize', () => hideBubble());

/** FIXED: use *viewport* coordinates for a fixed-position bubble; clamp to viewport. */
function showBubbleAtRect(rect) {
  if (!bubble || !rect) return;

  // Make it measurable first
  bubble.style.display = 'block';
  bubble.style.visibility = 'hidden';

  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 10;

  // Measure bubble after it's in the tree
  const br = bubble.getBoundingClientRect();

  // Horizontal: center on selection x, clamp inside viewport (accounting for translateX(-50%))
  let left = rect.left + (rect.width / 2);
  left = Math.max(br.width / 2 + 8, Math.min(left, vw - br.width / 2 - 8));

  // Vertical: prefer above; if not enough room, place below; clamp
  let top = rect.top - br.height - margin;
  if (top < 8) {
    top = rect.bottom + margin;
    if (top + br.height > vh - 8) {
      top = vh - br.height - 8;
    }
  }

  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top  = `${Math.round(top)}px`;
  bubble.style.visibility = '';
}
function hideBubble() { if (bubble) bubble.style.display = 'none'; }

/* ===== panel placement & dragging ===== */
/** FIXED: use viewport coords for fixed panel; clamp to viewport. */
function showPanelAtSelection(rect) {
  if (!panel) return showPanelCentered();
  panel.style.display = 'block';
  panel.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const margin = 12;

    // Measure panel
    const pr = panel.getBoundingClientRect();
    const panelW = pr.width || 360;
    const panelH = pr.height || 320;

    // Try right of selection
    let left = rect.right + margin;

    // If it overflows right, try left
    if (left + panelW > vw - 8) left = rect.left - panelW - margin;

    // If still out, center horizontally
    if (left < 8 || left + panelW > vw - 8) left = Math.max(8, Math.min((vw - panelW) / 2, vw - panelW - 8));

    // Vertically center around selection, clamp
    let top = rect.top + (rect.height / 2) - (panelH / 2);
    if (top < 8) top = 8;
    if (top + panelH > vh - 8) top = vh - panelH - 8;

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top  = `${Math.round(top)}px`;
    panel.style.visibility = '';

    if (lastSelection) panel.__savedSelection = { ...lastSelection };
    if (ta) { ta.value = lastSelection?.selected_text || ''; ta.focus(); }
    if (filterInput) filterInput.value = '';
    updateTokenBadge();
    renderComments();
  });
}
function showPanelCentered() {
  if (!panel) return;
  panel.style.display = 'block';
  panel.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8,(vw - rect.width) / 2)}px`;
    panel.style.top  = `${Math.max(8,(vh - rect.height) / 2)}px`;
    panel.style.visibility = '';
    if (ta) ta.value = '';
    updateTokenBadge();
    renderComments();
  });
}
function hidePanel() { if (panel) panel.style.display = 'none'; }

function makeDraggable(el, handle) {
  let dragging = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
  const onDown = (e) => { if (e.button !== 0) return; dragging = true; startX = e.clientX; startY = e.clientY; const rect = el.getBoundingClientRect(); baseLeft = rect.left; baseTop = rect.top; e.preventDefault(); };
  const onMove = (e) => { if (!dragging) return; const dx = e.clientX - startX; const dy = e.clientY - startY; el.style.left = `${Math.round(baseLeft + dx)}px`; el.style.top = `${Math.round(baseTop + dy)}px`; };
  const onUp = () => { dragging = false; };
  handle.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* ===== submit + comments rendering ===== */
function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase()); }

function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = !!busy;
  if (busy) { btn.dataset.prevText = btn.textContent; btn.textContent = 'Submitting…'; } else { btn.textContent = btn.dataset.prevText || 'Comment'; }
}

async function onSubmit() {
  let saved = lastSelection;
  if (!saved && panel && panel.__savedSelection) { saved = panel.__savedSelection; lastSelection = saved; }
  if (!saved || !saved.selected_text) { toast('Please select the text first.', 'warning'); return; }

  const commentText = (ta.value || '').trim();
  const tagged = (tagInput.value || '').trim();
  if (!commentText) { toast('Please write a comment.', 'warning'); return; }
  if (tagged && !validateEmail(tagged)) { toast('Please enter a valid email.', 'warning'); tagInput.focus(); return; }

  const payload = {
    page_url: saved.page_url || window.location.href,
    selected_text: saved.selected_text,
    container_xpath: saved.container_xpath,
    container_css: saved.container_css,
    start_index: saved.start_index,
    end_index: saved.end_index,
    prefix: saved.prefix,
    suffix: saved.suffix,
    comment_text: commentText,
    ...(tagged ? { tagged_user_email: tagged } : {})
  };

  const optimistic = { id: `temp-${Date.now()}`, user: { username: 'You' }, selected_text: payload.selected_text, comment_text: payload.comment_text, created_at: new Date().toISOString(), _optimistic: true };

  try {
    setBusy(submitBtn, true);
    addCommentCard(optimistic, true);
    const res = await callApi('comments/', 'POST', payload);
    if (!res) { removeOptimistic(optimistic.id); return; }
    removeOptimistic(optimistic.id);
    addCommentCard(res, true, true);
    ta.value = ''; tagInput.value = '';
    lastSelection = null; if (panel) panel.__savedSelection = null;
    hideBubble(); toast('Comment submitted!', 'ok');
  } catch (err) {
    console.error('Submit failed:', err);
    removeOptimistic(optimistic.id);
    toast(`Failed to submit comment: ${err.message || err}`, 'error');
  } finally {
    setBusy(submitBtn, false);
  }
}

function addCommentCard(comment, atTop = false, highlight = false) {
  if (!commentsContainer) return;
  const username = (comment && comment.user && comment.user.username) || comment.user || 'User';
  const sel = comment && comment.selected_text ? comment.selected_text : '';
  const text = comment && comment.comment_text ? comment.comment_text : '';

  const wrapper = document.createElement('div'); wrapper.className = 'comment-item';
  const left = document.createElement('div'); left.className = 'comment-left';
  const userEl = document.createElement('div'); userEl.className = 'comment-user'; userEl.textContent = username;
  const selEl = document.createElement('div'); selEl.className = 'comment-selected-text'; selEl.textContent = `"${sel.slice(0,300)}"`;
  const textEl = document.createElement('div'); textEl.className = 'comment-text'; textEl.textContent = text;
  left.appendChild(userEl); left.appendChild(selEl); left.appendChild(textEl);

  const right = document.createElement('div'); right.className = 'comment-actions';
  const goBtn = document.createElement('button'); goBtn.type = 'button'; goBtn.className = 'go-btn'; goBtn.textContent = 'Go';
  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!sel) { toast('No selection attached to this comment.', 'warning'); return; }
    const savedAnchor = {
      selected_text: comment.selected_text,
      container_xpath: comment.container_xpath,
      container_css: comment.container_css,
      start_index: comment.start_index,
      end_index: comment.end_index,
      prefix: comment.prefix,
      suffix: comment.suffix
    };
    const range = findSelectionOnPage(savedAnchor);
    if (range) {
      scrollRangeIntoView(range);
      highlightRange(range, 3500);
      const rect = range.getBoundingClientRect();
      showPanelAtSelection({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, centerX: rect.left + rect.width/2, centerY: rect.top + rect.height/2 });
    } else {
      toast('Could not find that selection on the page.', 'warning');
      console.debug('Could not find selection for comment anchor:', savedAnchor);
    }
  });

  const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'copy-btn'; copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(sel); toast('Selection copied.', 'ok'); } catch { toast('Copy failed.', 'error'); }
  });

  right.appendChild(goBtn); right.appendChild(copyBtn);

  wrapper.appendChild(left); wrapper.appendChild(right);

  if (atTop) commentsContainer.prepend(wrapper); else commentsContainer.appendChild(wrapper);
  if (highlight) { wrapper.style.outline = '2px solid rgba(91,140,255,0.45)'; setTimeout(()=>wrapper.style.outline='none',800); }

  wrapper.addEventListener('click', () => {
    const savedAnchor = {
      selected_text: comment.selected_text,
      container_xpath: comment.container_xpath,
      container_css: comment.container_css,
      start_index: comment.start_index,
      end_index: comment.end_index,
      prefix: comment.prefix,
      suffix: comment.suffix
    };
    const r = findSelectionOnPage(savedAnchor);
    if (r) { scrollRangeIntoView(r); highlightRange(r); } else { toast('Could not find that selection on the page.', 'warning'); console.debug('Find failed for', savedAnchor); }
  });
}

function removeOptimistic(tempId) {
  const el = commentsContainer?.querySelector(`[data-id="${CSS.escape(tempId)}"]`);
  if (el) el.remove();
}

async function renderComments() {
  if (!commentsContainer) return;
  commentsContainer.innerHTML = '<div style="text-align:center;padding:8px">Loading…</div>';
  try {
    const pageUrl = window.location.href;
    const comments = await callApi(`comments/?page_url=${encodeURIComponent(pageUrl)}`);
    commentsContainer.innerHTML = '';
    if (Array.isArray(comments) && comments.length) {
      comments.sort((a,b) => (Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)));
      comments.forEach(c => addCommentCard(c));
    } else {
      commentsContainer.innerHTML = '<div style="text-align:center;color:#a8b0c0;padding:6px">No comments yet.</div>';
    }
  } catch (err) {
    commentsContainer.innerHTML = '<div style="text-align:center;color:#f87171;padding:6px">Failed to load comments.</div>';
    console.error('renderComments error:', err);
  }
}

function filterComments(q) {
  if (!commentsContainer) return;
  const ql = (q || '').trim().toLowerCase();
  const items = commentsContainer.querySelectorAll('.comment-item');
  let any = false;
  items.forEach(it => {
    const txt = it.innerText.toLowerCase();
    const visible = !ql || txt.includes(ql);
    it.style.display = visible ? '' : 'none';
    if (visible) any = true;
  });
}

/* ===== token badge & debug ===== */
async function updateTokenBadge() {
  try {
    const el = shadowRoot ? shadowRoot.querySelector('#token-badge') : null;
    if (!el) return;
    const info = await getAuthToken();
    if (info && info.token) el.textContent = `auth: ${info.source || 'found'}`; else el.textContent = 'auth: none';
  } catch (e) { /* ignore */ }
}

/* ===== toast ===== */
function toast(msg, _type='ok', ms=2200) {
  ensureUI();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  toastHost.appendChild(t);
  setTimeout(()=>{ try{ t.remove(); }catch{} }, ms);
  return () => { try{ t.remove(); }catch{} };
}

/* ===== boot ===== */
document.addEventListener('DOMContentLoaded', () => {
  ensureUI();
  updateTokenBadge();
});
