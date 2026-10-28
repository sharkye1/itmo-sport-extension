const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createDOM, createMockChrome, loadScript, cleanupDOMs } = require('./test-helper');

describe('Feature 9: Compact Mode (Компактный режим)', () => {
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
          <div class="header-container">
            <div class="switcher"></div>
          </div>
          <div class="el-calendar-table">
            <div class="el-calendar-row">
              <div class="day-cell time-cell">
                <div class="time-start">08:10</div>
                <div class="time-end">09:40</div>
              </div>
              <div class="day-cell">
                <div class="section-block" id="section-101">
                  <div class="sport-item">
                    <span class="section-name">Волейбол</span>
                    <span class="teacher">Иванов Иван Иванович</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
  });

  it('should apply data-itmo-compact="true" on documentElement on bridge init by default', () => {
    loadScript(dom, 'content/page-bridge.js');
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');
  });

  it('should toggle data-itmo-compact when in-page compact toggle is changed', async () => {
    loadScript(dom, 'content/page-bridge.js');

    // Wait for in-page switcher to be created (scheduleUpdateUI has 100ms initial delay)
    await new Promise(r => setTimeout(r, 150));

    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    assert.ok(toggle, 'Compact toggle should exist in DOM');
    assert.equal(toggle.checked, true, 'Default compact toggle should be checked');

    // Untoggle
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));

    assert.equal(
      dom.window.document.documentElement.getAttribute('data-itmo-compact'),
      null,
      'data-itmo-compact should be removed when toggled off'
    );

    // Toggle back on
    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change'));

    assert.equal(
      dom.window.document.documentElement.getAttribute('data-itmo-compact'),
      'true',
      'data-itmo-compact should be set to true when toggled on'
    );
  });

  it('should update data-itmo-compact when bridge receives ITMO_SPORT_UPDATE_SETTINGS', async () => {
    loadScript(dom, 'content/page-bridge.js');

    // Post message to turn off compact mode
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { compactMode: false }
    }, '*');

    await new Promise(r => setTimeout(r, 80));
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);

    // Post message to turn on compact mode
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { compactMode: true }
    }, '*');

    await new Promise(r => setTimeout(r, 80));
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');
  });

  it('should post ITMO_SPORT_BRIDGE_SETTING_CHANGED message when compact toggle is clicked', async () => {
    const messages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ITMO_SPORT_BRIDGE_SETTING_CHANGED') {
        messages.push(e.data);
      }
    });

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    assert.ok(toggle);

    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));

    await new Promise(r => setTimeout(r, 30));

    const settingMsg = messages.find(m => m.setting === 'compactMode');
    assert.ok(settingMsg, 'Bridge should broadcast setting change message');
    assert.equal(settingMsg.value, false);
  });

  it('should sync compact mode in content.js to documentElement and chrome.storage', async () => {
    const mockChrome = createMockChrome();
    dom.window.chrome = mockChrome;

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 20));

    // Initially, default compactMode is true
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');

    // Simulate bridge sending setting change for compactMode: false
    dom.window.postMessage({
      type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
      setting: 'compactMode',
      value: false
    }, '*');

    await new Promise(r => setTimeout(r, 50));

    // Should remove data-itmo-compact
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);
    // Should persist to storage
    assert.equal(mockChrome.storage.local._data.compactMode, false);
  });

  it('should not set data-itmo-compact if compactMode is false in initial storage', async () => {
    const mockChrome = createMockChrome({ compactMode: false });
    dom.window.chrome = mockChrome;

    loadScript(dom, 'content/content.js');
    await new Promise(r => setTimeout(r, 40));

    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), null);
  });

  it('should contain all required compact mode CSS rules in content/styles.css', () => {
    const cssPath = path.resolve(__dirname, '..', 'content', 'styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Verify root selector
    assert.ok(css.includes('html[data-itmo-compact="true"]'), 'Should target html[data-itmo-compact="true"]');

    // 1. Min-height reduction ~52px
    assert.ok(css.includes('52px'), 'Should define min-height ~52px');
    assert.ok(css.includes('.el-calendar-row'), 'Should target calendar row');
    assert.ok(css.includes('.day-cell'), 'Should target day cell');
    assert.ok(css.includes('.el-calendar-day'), 'Should target el-calendar-day to override Element UI 85px');

    // 2. Single line time cell (08:10 – 09:40)
    assert.ok(css.includes('.time-cell'), 'Should target time cell');
    assert.ok(css.includes('content: " – "'), 'Should add dash separator between start and end time');
    assert.ok(css.includes('white-space: nowrap'), 'Should enforce single-line nowrap');

    // 3. Compact padding on lesson cards
    assert.ok(css.includes('.section-block'), 'Should target section-block');
    assert.ok(css.includes('.sport-item'), 'Should target sport-item');
    assert.ok(css.includes('word-break: break-word'), 'Should allow section-name to break words naturally');

    // 4. Single-line teacher name with ellipsis
    assert.ok(css.includes('text-overflow: ellipsis'), 'Should have text-overflow ellipsis');
    assert.ok(css.includes('.teacher'), 'Should target teacher name');
    assert.ok(css.includes(':not(.section-name)'), 'Should protect section name from teacher ellipsis');
    assert.ok(css.includes(':not(.red_circle)'), 'Should protect red_circle intersection dot');

    // 5. Compact badge and building tag
    assert.ok(css.includes('.itmo-sport-badge'), 'Should style badge compactly');
    assert.ok(css.includes('.itmo-sport-building-tag'), 'Should style building tag compactly');

    // 6. Compact banner alert and legend
    assert.ok(css.includes('.alert'), 'Should target alert banners');
    assert.ok(css.includes('.legend'), 'Should target legend');
  });
});
