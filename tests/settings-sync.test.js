const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createDOM, createMockChrome, loadScript, cleanupDOMs } = require('./test-helper');

describe('Settings persistence and synchronization', () => {
  let mockChrome;

  afterEach(() => {
    cleanupDOMs();
  });

  beforeEach(() => {
    mockChrome = createMockChrome();
  });

  it('should load default settings in content.js and broadcast them to bridge', async () => {
    const dom = createDOM();
    dom.window.chrome = mockChrome;

    const postedMessages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ITMO_SPORT_UPDATE_SETTINGS') {
        postedMessages.push(e.data);
      }
    });

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 40));

    assert.equal(postedMessages.length, 1);
    const settings = postedMessages[0].settings;
    assert.deepEqual(JSON.parse(JSON.stringify(settings)), {
      hideZeroSpots: true,
      hideIntersections: false,
      compactMode: true,
      showBadges: true,
      selectedBuildingIds: []
    });
  });

  it('should sync settings changed in bridge into chrome.storage.local via content.js', async () => {
    const dom = createDOM();
    dom.window.chrome = mockChrome;

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 30));

    // Bridge emits that user toggled hideZeroSpots to false
    dom.window.postMessage({
      type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
      setting: 'hideZeroSpots',
      value: false
    }, '*');

    await new Promise(r => setTimeout(r, 40));
    assert.equal(mockChrome.storage.local._data.hideZeroSpots, false);

    // Bridge emits compactMode changed to false
    dom.window.postMessage({
      type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
      setting: 'compactMode',
      value: false
    }, '*');

    await new Promise(r => setTimeout(r, 40));
    assert.equal(mockChrome.storage.local._data.compactMode, false);
  });

  it('should propagate chrome.storage.onChanged to bridge via content.js', async () => {
    const dom = createDOM();
    dom.window.chrome = mockChrome;

    const postedMessages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ITMO_SPORT_UPDATE_SETTINGS') {
        postedMessages.push(e.data);
      }
    });

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 30));
    postedMessages.length = 0; // Clear initial load message

    // Simulate external storage update (e.g. from popup)
    await mockChrome.storage.local.set({ compactMode: false, hideIntersections: true });
    await new Promise(r => setTimeout(r, 40));

    assert.ok(postedMessages.length >= 1, 'Should send ITMO_SPORT_UPDATE_SETTINGS on storage change');
    const latest = postedMessages[postedMessages.length - 1].settings;
    assert.equal(latest.compactMode, false);
    assert.equal(latest.hideIntersections, true);
  });

  it('should respond to GET_EXTENSION_STATE runtime message in content.js', async () => {
    const dom = createDOM();
    dom.window.chrome = mockChrome;

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 30));

    // Send bridge stats update first
    dom.window.postMessage({
      type: 'ITMO_SPORT_BRIDGE_STATS_UPDATE',
      stats: { total: 10, available: 6, hidden: 4 },
      buildings: [{ id: 1, name: 'Ломоносова, 9' }],
      selectedBuildingIds: ['1']
    }, '*');
    await new Promise(r => setTimeout(r, 30));

    // Query state
    const res = await mockChrome.runtime.sendMessage({ type: 'GET_EXTENSION_STATE' });
    assert.ok(res);
    assert.equal(res.settings.compactMode, true);
    assert.equal(res.stats.total, 10);
    assert.equal(res.stats.hidden, 4);
    assert.equal(res.buildings.length, 1);
  });

  it('should initialize popup toggles correctly from storage and update storage on change', async () => {
    await mockChrome.storage.local.set({
      hideZeroSpots: false,
      hideIntersections: true,
      compactMode: false,
      showBadges: false,
      selectedBuildingIds: ['2']
    });

    const popupHtml = fs.readFileSync(path.resolve(__dirname, '..', 'popup', 'popup.html'), 'utf8');
    const popupDom = createDOM(popupHtml, { url: 'chrome-extension://test/popup/popup.html' });
    popupDom.window.chrome = mockChrome;

    loadScript(popupDom, 'popup/popup.js');
    popupDom.window.document.dispatchEvent(new popupDom.window.Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 50));

    const toggleZero = popupDom.window.document.getElementById('toggle-hide-zero');
    const toggleIntersections = popupDom.window.document.getElementById('toggle-hide-intersections');
    const toggleCompact = popupDom.window.document.getElementById('toggle-compact-mode');
    const toggleBadges = popupDom.window.document.getElementById('toggle-show-badges');

    assert.equal(toggleZero.checked, false);
    assert.equal(toggleIntersections.checked, true);
    assert.equal(toggleCompact.checked, false);
    assert.equal(toggleBadges.checked, false);

    // Toggle compact mode in popup
    toggleCompact.checked = true;
    toggleCompact.dispatchEvent(new popupDom.window.Event('change'));
    await new Promise(r => setTimeout(r, 40));

    assert.equal(mockChrome.storage.local._data.compactMode, true);
  });

  it('should synchronize popup switches when storage changes in background', async () => {
    const popupHtml = fs.readFileSync(path.resolve(__dirname, '..', 'popup', 'popup.html'), 'utf8');
    const popupDom = createDOM(popupHtml, { url: 'chrome-extension://test/popup/popup.html' });
    popupDom.window.chrome = mockChrome;

    loadScript(popupDom, 'popup/popup.js');
    popupDom.window.document.dispatchEvent(new popupDom.window.Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 50));

    const toggleCompact = popupDom.window.document.getElementById('toggle-compact-mode');
    assert.equal(toggleCompact.checked, true);

    // Simulate in-page switcher or content script writing to storage
    await mockChrome.storage.local.set({ compactMode: false });
    await new Promise(r => setTimeout(r, 30));

    assert.equal(toggleCompact.checked, false, 'Popup compact toggle should update when storage changes');
  });

  it('should handle SET_SETTING runtime message in content.js and broadcast updated setting to bridge', async () => {
    const dom = createDOM();
    dom.window.chrome = mockChrome;

    const postedMessages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ITMO_SPORT_UPDATE_SETTINGS') {
        postedMessages.push(e.data);
      }
    });

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 30));
    postedMessages.length = 0;

    // Send SET_SETTING runtime message
    const res = await mockChrome.runtime.sendMessage({
      type: 'SET_SETTING',
      setting: 'compactMode',
      value: false
    });

    assert.ok(res);
    assert.equal(res.success, true);
    assert.equal(res.settings.compactMode, false);
    assert.equal(mockChrome.storage.local._data.compactMode, false);
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);

    await new Promise(r => setTimeout(r, 30));
    assert.ok(postedMessages.length >= 1);
    assert.equal(postedMessages[postedMessages.length - 1].settings.compactMode, false);
  });

  it('should send SET_SETTING message from popup to active tab and update state end-to-end', async () => {
    const pageDom = createDOM();
    pageDom.window.chrome = mockChrome;
    loadScript(pageDom, 'content/content.js');
    await new Promise(r => setTimeout(r, 40));

    const popupHtml = fs.readFileSync(path.resolve(__dirname, '..', 'popup', 'popup.html'), 'utf8');
    const popupDom = createDOM(popupHtml, { url: 'chrome-extension://test/popup/popup.html' });
    popupDom.window.chrome = mockChrome;

    loadScript(popupDom, 'popup/popup.js');
    popupDom.window.document.dispatchEvent(new popupDom.window.Event('DOMContentLoaded'));
    await new Promise(r => setTimeout(r, 60));

    const toggleCompact = popupDom.window.document.getElementById('toggle-compact-mode');
    assert.equal(toggleCompact.checked, true);

    // Toggle off in popup
    toggleCompact.checked = false;
    toggleCompact.dispatchEvent(new popupDom.window.Event('change'));
    await new Promise(r => setTimeout(r, 60));

    assert.equal(mockChrome.storage.local._data.compactMode, false);
    assert.equal(pageDom.window.document.documentElement.getAttribute('data-itmo-compact'), null);
  });
});
