const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, loadScript, cleanupDOMs } = require('./test-helper');

describe('In-page switchers rendering and handling', () => {
  let dom;

  afterEach(() => {
    cleanupDOMs();
  });

  beforeEach(() => {
    dom = createDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div class="filters-panel">
            <div class="switcher native-switcher">
              <input type="checkbox" class="switcher-input">
              <span class="switcher-label">Доступные для записи</span>
            </div>
          </div>
          <div class="schedule-content"></div>
        </body>
      </html>
    `);
  });

  it('should inject .itmo-sport-switch-wrapper containing all 3 switchers next to existing .switcher', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const wrapper = dom.window.document.querySelector('.itmo-sport-switch-wrapper');
    assert.ok(wrapper, 'Wrapper should be injected');

    const toggleSpots = wrapper.querySelector('#itmo-sport-inpage-toggle');
    const toggleIntersections = wrapper.querySelector('#itmo-sport-toggle-intersections');
    const toggleCompact = wrapper.querySelector('#itmo-sport-toggle-compact');

    assert.ok(toggleSpots, 'Spots toggle should exist');
    assert.ok(toggleIntersections, 'Intersections toggle should exist');
    assert.ok(toggleCompact, 'Compact mode toggle should exist');

    assert.equal(toggleSpots.checked, true, 'Spots toggle defaults to true');
    assert.equal(toggleIntersections.checked, false, 'Intersections toggle defaults to false');
    assert.equal(toggleCompact.checked, true, 'Compact toggle defaults to true');
  });

  it('should handle toggle changes and fire ITMO_SPORT_BRIDGE_SETTING_CHANGED for each toggle', async () => {
    const received = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data?.type === 'ITMO_SPORT_BRIDGE_SETTING_CHANGED') {
        received.push(e.data);
      }
    });

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const toggleSpots = dom.window.document.querySelector('#itmo-sport-inpage-toggle');
    const toggleIntersections = dom.window.document.querySelector('#itmo-sport-toggle-intersections');
    const toggleCompact = dom.window.document.querySelector('#itmo-sport-toggle-compact');

    // 1. Toggle spots off
    toggleSpots.checked = false;
    toggleSpots.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 30));

    // 2. Toggle intersections on
    toggleIntersections.checked = true;
    toggleIntersections.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 30));

    // 3. Toggle compact off
    toggleCompact.checked = false;
    toggleCompact.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 30));

    const spotsMsg = received.find(m => m.setting === 'hideZeroSpots');
    const intersectionsMsg = received.find(m => m.setting === 'hideIntersections');
    const compactMsg = received.find(m => m.setting === 'compactMode');

    assert.ok(spotsMsg && spotsMsg.value === false);
    assert.ok(intersectionsMsg && intersectionsMsg.value === true);
    assert.ok(compactMsg && compactMsg.value === false);
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);
  });

  it('should update in-page toggle states when receiving ITMO_SPORT_UPDATE_SETTINGS', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const toggleSpots = dom.window.document.querySelector('#itmo-sport-inpage-toggle');
    const toggleIntersections = dom.window.document.querySelector('#itmo-sport-toggle-intersections');
    const toggleCompact = dom.window.document.querySelector('#itmo-sport-toggle-compact');

    assert.equal(toggleSpots.checked, true);
    assert.equal(toggleIntersections.checked, false);
    assert.equal(toggleCompact.checked, true);

    // External change from popup/content script
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: {
        hideZeroSpots: false,
        hideIntersections: true,
        compactMode: false
      }
    }, '*');

    await new Promise(r => setTimeout(r, 80));

    assert.equal(toggleSpots.checked, false);
    assert.equal(toggleIntersections.checked, true);
    assert.equal(toggleCompact.checked, false);
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);
  });

  it('should upgrade existing wrapper if it was rendered without compact toggle', async () => {
    // Inject outdated wrapper with only 2 toggles
    const nativeSwitcher = dom.window.document.querySelector('.switcher');
    const outdatedWrapper = dom.window.document.createElement('div');
    outdatedWrapper.className = 'itmo-sport-switch-wrapper';
    outdatedWrapper.innerHTML = `
      <input type="checkbox" id="itmo-sport-inpage-toggle">
      <input type="checkbox" id="itmo-sport-toggle-intersections">
    `;
    nativeSwitcher.parentElement.appendChild(outdatedWrapper);

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const compactToggle = dom.window.document.querySelector('#itmo-sport-toggle-compact');
    assert.ok(compactToggle, 'Should recreate/upgrade wrapper so compact toggle is present');
  });

  it('should re-attach switcher if parent container is dynamically re-rendered by Vue', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    let wrapper = dom.window.document.querySelector('.itmo-sport-switch-wrapper');
    assert.ok(wrapper);

    // Simulate Vue re-rendering the .filters-panel container with a new DOM tree
    const panel = dom.window.document.querySelector('.filters-panel');
    panel.innerHTML = `
      <div class="switcher native-switcher-v2">
        <input type="checkbox" class="switcher-input">
        <span class="switcher-label">Доступные для записи (v2)</span>
      </div>
    `;

    // Trigger DOM mutation
    await new Promise(r => setTimeout(r, 150));

    const newNative = dom.window.document.querySelector('.native-switcher-v2');
    const reattachedWrapper = dom.window.document.querySelector('.itmo-sport-switch-wrapper');

    assert.ok(reattachedWrapper, 'Wrapper should be re-created/attached in new tree');
    assert.equal(reattachedWrapper.parentElement, newNative.parentElement, 'Should be placed next to new switcher');
    assert.ok(reattachedWrapper.querySelector('#itmo-sport-toggle-compact'), 'Compact toggle should be present');
  });

  it('should not throw or nest if native switcher is temporarily absent', async () => {
    // DOM without native switcher
    const emptyDom = createDOM(`
      <!DOCTYPE html><html><body><div class="no-switchers"></div></body></html>
    `);

    assert.doesNotThrow(() => {
      loadScript(emptyDom, 'content/page-bridge.js');
    });

    await new Promise(r => setTimeout(r, 150));
    assert.equal(emptyDom.window.document.querySelector('.itmo-sport-switch-wrapper'), null);
  });
});
