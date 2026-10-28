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

  it('should shorten teacher FIO to surname and initials in compact mode, and preserve original in title and data-original-name', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const teacher = dom.window.document.querySelector('#section-101 .teacher');
    assert.ok(teacher, 'Teacher element should exist');
    assert.equal(teacher.textContent, 'Иванов И. И.', 'Full FIO should be shortened to Surname I. O.');
    assert.equal(teacher.getAttribute('data-original-name'), 'Иванов Иван Иванович', 'data-original-name should store original full name');
    assert.equal(teacher.getAttribute('title'), 'Иванов Иван Иванович', 'title tooltip should store original full name');
  });

  it('should restore full teacher FIO when compact mode is toggled off and shorten again when toggled on', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    const teacher = dom.window.document.querySelector('#section-101 .teacher');
    assert.equal(teacher.textContent, 'Иванов И. И.');

    // Toggle off
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 80));

    assert.equal(teacher.textContent, 'Иванов Иван Иванович', 'Full FIO should be restored when compact mode is disabled');
    assert.equal(teacher.getAttribute('data-original-name'), null, 'data-original-name should be cleared');

    // Toggle back on
    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 80));

    assert.equal(teacher.textContent, 'Иванов И. И.', 'FIO should be shortened again when compact mode is re-enabled');
    assert.equal(teacher.getAttribute('data-original-name'), 'Иванов Иван Иванович');
  });

  it('should format different teacher name structures properly', async () => {
    // Add multiple test cards with various name variations
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-201">
          <div class="sport-item">
            <span class="section-name">Академическая гребля</span>
            <span class="teacher">Платонова Валентина Александровна</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-202">
          <div class="sport-item">
            <span class="section-name">Бокс</span>
            <span class="teacher">Петров Петр</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-203">
          <div class="sport-item">
            <span class="section-name">Фитнес</span>
            <span class="teacher">Сидоров</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-204">
          <div class="sport-item">
            <span class="section-name">Йога</span>
            <span class="teacher">Смирнов А. Б.</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-205">
          <div class="sport-item">
            <span class="section-name">Теннис</span>
            <span class="teacher">Смирнова Анна-Мария Ивановна</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-206">
          <div class="sport-item">
            <span class="section-name">Баскетбол</span>
            <span class="teacher">Платонова Валентина Александровна, Кузнецов Сергей Петрович</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-207">
          <div class="sport-item">
            <span class="section-name">Волейбол</span>
            <span class="teacher">В. А. Платонова</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-208">
          <div class="sport-item">
            <span class="section-name">Бадминтон</span>
            <span class="teacher">В.А. Платонова</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-209">
          <div class="sport-item">
            <span class="section-name">Аэробика</span>
            <span class="teacher">Валентина Александровна Платонова</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-210">
          <div class="sport-item">
            <span class="section-name">ОФП</span>
            <span class="teacher">доц. Иванов Иван Иванович</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-211">
          <div class="sport-item">
            <span class="section-name">Стрельба</span>
            <span class="teacher">ст. преп. Платонова В. А.</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-212">
          <div class="sport-item">
            <span class="section-name">Бильярд</span>
            <span class="teacher">проф. Петров П. П.</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-213">
          <div class="sport-item">
            <span class="section-name">Лыжи</span>
            <span class="teacher">Мамин-Сибиряк Дмитрий Наркисович</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-214">
          <div class="sport-item">
            <span class="section-name">Шахматы</span>
            <span class="teacher">Платонова В. А. / Иванов И. И.</span>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    assert.equal(dom.window.document.querySelector('#section-201 .teacher').textContent, 'Платонова В. А.');
    assert.equal(dom.window.document.querySelector('#section-202 .teacher').textContent, 'Петров П.');
    assert.equal(dom.window.document.querySelector('#section-203 .teacher').textContent, 'Сидоров');
    assert.equal(dom.window.document.querySelector('#section-204 .teacher').textContent, 'Смирнов А. Б.');
    assert.equal(dom.window.document.querySelector('#section-205 .teacher').textContent, 'Смирнова А.-М. И.');
    assert.equal(dom.window.document.querySelector('#section-206 .teacher').textContent, 'Платонова В. А., Кузнецов С. П.');
    assert.equal(dom.window.document.querySelector('#section-207 .teacher').textContent, 'Платонова В. А.');
    assert.equal(dom.window.document.querySelector('#section-208 .teacher').textContent, 'Платонова В. А.');
    assert.equal(dom.window.document.querySelector('#section-209 .teacher').textContent, 'Платонова В. А.');
    assert.equal(dom.window.document.querySelector('#section-210 .teacher').textContent, 'Иванов И. И.');
    assert.equal(dom.window.document.querySelector('#section-211 .teacher').textContent, 'Платонова В. А.');
    assert.equal(dom.window.document.querySelector('#section-212 .teacher').textContent, 'Петров П. П.');
    assert.equal(dom.window.document.querySelector('#section-213 .teacher').textContent, 'Мамин-Сибиряк Д. Н.');
    assert.equal(dom.window.document.querySelector('#section-214 .teacher').textContent, 'Платонова В. А. / Иванов И. И.');
  });

  it('should arrange section name and spots badge on line 1, and teacher and building tag on line 2', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const card = dom.window.document.getElementById('section-101');
    const sportItem = card.querySelector('.sport-item');

    // Line 1: .itmo-sport-title-row containing section-name and badge
    const titleRow = sportItem.querySelector('.itmo-sport-title-row');
    assert.ok(titleRow, 'Title row wrapper should exist');
    const nameSection = titleRow.querySelector('.section-name');
    assert.ok(nameSection, 'Section name should be inside title row');
    const badge = titleRow.querySelector('.itmo-sport-badge');
    assert.ok(badge, 'Spots badge should be inside title row next to section name');

    // Line 2: .itmo-sport-meta-row containing teacher
    const metaRow = sportItem.querySelector('.itmo-sport-meta-row');
    assert.ok(metaRow, 'Meta row wrapper should exist');
    const teacher = metaRow.querySelector('.teacher');
    assert.ok(teacher, 'Teacher should be inside meta row');
  });

  it('should place both teacher initials and building tag inside meta-row in multi-building mode', async () => {
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            filters: {
              filters: {
                buildings: [
                  { id: 1, name: 'ул. Ломоносова, д. 9' },
                  { id: 2, name: 'Вяземский пер., д. 5/7' }
                ]
              }
            }
          }
        },
        commit: () => {},
        dispatch: () => {},
        subscribe: () => {}
      }
    };

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    dom.window.fetch = async (url) => {
      const u = new URL(url, 'https://my.itmo.ru');
      const bId = u.searchParams.get('building_id');
      const lessons = bId === '1' ? [{ id: 101, date_start: futureDate }] : [];
      return {
        ok: true,
        clone: () => ({
          json: async () => ({ error_code: 0, result: [{ date: futureDate, lessons }] })
        }),
        json: async () => ({ error_code: 0, result: [{ date: futureDate, lessons }] })
      };
    };

    loadScript(dom, 'content/page-bridge.js');

    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: {
        selectedBuildingIds: ['1', '2']
      }
    }, '*');

    await new Promise(r => setTimeout(r, 400));

    const card = dom.window.document.getElementById('section-101');
    const metaRow = card.querySelector('.itmo-sport-meta-row');
    assert.ok(metaRow, 'Meta row should exist');
    const teacher = metaRow.querySelector('.teacher');
    assert.ok(teacher, 'Teacher should be inside meta row');
    assert.equal(teacher.textContent, 'Иванов И. И.');
    const bTag = metaRow.querySelector('.itmo-sport-building-tag');
    assert.ok(bTag, 'Building tag should be inside meta row on line 2');
    assert.ok(bTag.textContent.includes('Ломоносова'));
  });

  it('should format time cell into stacked time-start and time-end without horizontal clipping', async () => {
    const table = dom.window.document.querySelector('.el-calendar-table');
    table.innerHTML += `
      <div class="el-calendar-row">
        <div class="day-cell time-cell" id="raw-time-cell">10:00 - 11:30</div>
        <div class="day-cell"></div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const timeCell1 = dom.window.document.querySelector('.time-cell');
    assert.ok(timeCell1.querySelector('.time-start'), 'First time cell should have time-start element');
    assert.ok(timeCell1.querySelector('.time-end'), 'First time cell should have time-end element');
    assert.equal(timeCell1.querySelector('.time-start').textContent, '08:10');
    assert.equal(timeCell1.querySelector('.time-end').textContent, '09:40');

    const rawTimeCell = dom.window.document.getElementById('raw-time-cell');
    assert.ok(rawTimeCell.querySelector('.time-start'), 'Raw string time-cell should be structured into time-start');
    assert.ok(rawTimeCell.querySelector('.time-end'), 'Raw string time-cell should be structured into time-end');
    assert.equal(rawTimeCell.querySelector('.time-start').textContent, '10:00');
    assert.equal(rawTimeCell.querySelector('.time-end').textContent, '11:30');
  });

  it('should restore original time-cell format when compact mode is toggled off', async () => {
    const table = dom.window.document.querySelector('.el-calendar-table');
    table.innerHTML += `
      <div class="el-calendar-row">
        <div class="day-cell time-cell" id="toggle-time-cell">12:00 - 13:30</div>
        <div class="day-cell"></div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const timeCell = dom.window.document.getElementById('toggle-time-cell');
    assert.ok(timeCell.querySelector('.time-start'), 'Should have structured time-start in compact mode');
    assert.ok(timeCell.querySelector('.time-end'), 'Should have structured time-end in compact mode');

    // Toggle off
    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 80));

    assert.equal(timeCell.textContent.trim(), '12:00 - 13:30', 'Original text should be restored when compact mode is disabled');
    assert.equal(timeCell.querySelector('.time-start'), null, 'time-start should no longer exist when restored');

    // Toggle back on
    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 80));

    assert.ok(timeCell.querySelector('.time-start'), 'time-start should be recreated when compact mode re-enabled');
  });

  it('should clean up rogue separator text nodes when time-start and time-end are already present', async () => {
    const table = dom.window.document.querySelector('.el-calendar-table');
    table.innerHTML += `
      <div class="el-calendar-row">
        <div class="day-cell time-cell" id="rogue-sep-cell">
          <div class="time-start">14:00</div>
          -
          <div class="time-end">15:30</div>
        </div>
        <div class="day-cell"></div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const cell = dom.window.document.getElementById('rogue-sep-cell');
    const start = cell.querySelector('.time-start');
    const end = cell.querySelector('.time-end');
    assert.ok(start && end);
    assert.equal(start.textContent, '14:00');
    assert.equal(end.textContent, '15:30');

    // Text between should be cleared so flex column does not display extra rogue lines
    const nonElementNodes = Array.from(cell.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    assert.equal(nonElementNodes.length, 0, 'No non-empty text separator nodes should remain');
  });

  it('should render spots badge with badge-count-text, badge-unit, and title tooltip', async () => {
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                '5': { 101: { limit: 20, available: 12 } }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: new Date(Date.now() + 86400000).toISOString(),
                  lessons: [{ id: 101, lesson_group_id: 5 }]
                }
              ]
            }
          }
        },
        commit: () => {},
        dispatch: () => {},
        subscribe: () => {}
      }
    };

    dom.window.fetch = async (url) => {
      return {
        ok: true,
        json: async () => ({
          result: {
            5: { 101: { limit: 20, available: 12 } }
          }
        })
      };
    };

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 200));

    const badge = dom.window.document.querySelector('#section-101 .itmo-sport-badge');
    assert.ok(badge, 'Spots badge should be present');
    assert.ok(badge.querySelector('.badge-count-text'), 'Badge should have badge-count-text span');
    assert.equal(badge.querySelector('.badge-count-text').textContent, '12 / 20');
    assert.ok(badge.querySelector('.badge-unit'), 'Badge should have badge-unit span');
    assert.equal(badge.querySelector('.badge-unit').textContent, ' мест');
    assert.ok(badge.getAttribute('title').includes('12 из 20 мест'), 'Badge should have informative title tooltip');
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

    // 2. Time column: 2 stacked lines with sufficient column width and alignment
    assert.ok(css.includes('.time-cell'), 'Should target time cell');
    assert.ok(css.includes('.el-calendar-row-head'), 'Should target calendar header row');
    assert.ok(css.includes('60px'), 'Should define column width ~60px to prevent clipping');
    assert.ok(css.includes('max-width: 60px'), 'Should define max-width: 60px for strict column width');
    assert.ok(css.includes('flex-direction: column'), 'Should stack time-start and time-end vertically');

    // 3. Compact 2-line layout (Line 1: Title + Badge, Line 2: Teacher initials + Building tag)
    assert.ok(css.includes('.itmo-sport-title-row'), 'Should target itmo-sport-title-row');
    assert.ok(css.includes('.itmo-sport-meta-row'), 'Should target itmo-sport-meta-row');
    assert.ok(css.includes('align-items: baseline'), 'Should align title and badge by baseline');
    assert.ok(css.includes('justify-content: space-between'), 'Should justify space-between for title and badge');
    assert.ok(css.includes('-webkit-line-clamp: 2'), 'Should allow title to clamp gracefully');
    assert.ok(css.includes('.badge-unit'), 'Should hide badge-unit in compact mode to fit single line');

    // 4. Compact badge and building tag
    assert.ok(css.includes('.itmo-sport-badge'), 'Should style badge compactly');
    assert.ok(css.includes('.itmo-sport-building-tag'), 'Should style building tag compactly');

    // 5. Compact headers, banners, alert, tabs, and calendar headers before the calendar
    assert.ok(css.includes('.alert'), 'Should target alert banners');
    assert.ok(css.includes('.nav-tabs'), 'Should target nav-tabs');
    assert.ok(css.includes('.card'), 'Should target cards before calendar');
    assert.ok(css.includes('.card-header'), 'Should target card headers');
    assert.ok(css.includes('.el-calendar__header'), 'Should target calendar header toolbar');
  });

  it('should keep native card DOM layout completely intact when compactMode is false', async () => {
    // Start bridge with compactMode: false
    dom.window.eval(`
      window.__ITMO_SPORT_BRIDGE_LOADED__ = false;
    `);

    // Override initial settings postMessage before bridge script or simulate immediately
    loadScript(dom, 'content/page-bridge.js');

    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { compactMode: false, showBadges: true }
    }, '*');

    await new Promise(r => setTimeout(r, 150));

    const card = dom.window.document.getElementById('section-101');
    const sportItem = card.querySelector('.sport-item');

    // In standard mode: NO .itmo-sport-title-row and NO .itmo-sport-meta-row
    assert.equal(sportItem.querySelector('.itmo-sport-title-row'), null, 'itmo-sport-title-row should NOT exist when compact mode is OFF');
    assert.equal(sportItem.querySelector('.itmo-sport-meta-row'), null, 'itmo-sport-meta-row should NOT exist when compact mode is OFF');

    // Elements should be directly in sportItem in native order: section-name on top, teacher underneath, badge at bottom
    const children = Array.from(sportItem.children);
    assert.equal(children[0].className, 'section-name', 'First child must be section-name');
    assert.equal(children[0].textContent, 'Волейбол');

    assert.ok(children[1].classList.contains('teacher'), 'Second child must be teacher');
    assert.equal(children[1].textContent, 'Иванов Иван Иванович', 'Teacher name must remain full and unshortened');
    assert.equal(children[1].getAttribute('data-original-name'), null);

    assert.ok(children[2].classList.contains('itmo-sport-badge'), 'Third child must be spots badge at bottom of card');
  });

  it('should cleanly unwrap title-row and meta-row and restore native card DOM order when compact mode is toggled off', async () => {
    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const card = dom.window.document.getElementById('section-101');
    const sportItem = card.querySelector('.sport-item');

    // In compact mode: title-row and meta-row exist
    assert.ok(sportItem.querySelector('.itmo-sport-title-row'), 'title-row must exist in compact mode');
    assert.ok(sportItem.querySelector('.itmo-sport-meta-row'), 'meta-row must exist in compact mode');

    // Toggle compact mode OFF
    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));

    await new Promise(r => setTimeout(r, 100));

    // After toggling OFF: title-row and meta-row should be completely unwrapped and removed
    assert.equal(sportItem.querySelector('.itmo-sport-title-row'), null, 'title-row should be removed after toggle off');
    assert.equal(sportItem.querySelector('.itmo-sport-meta-row'), null, 'meta-row should be removed after toggle off');

    const children = Array.from(sportItem.children);
    assert.equal(children[0].className, 'section-name', 'Section name must be restored to first child');
    assert.equal(children[0].textContent, 'Волейбол');

    assert.ok(children[1].classList.contains('teacher'), 'Teacher must be restored under section name');
    assert.equal(children[1].textContent, 'Иванов Иван Иванович', 'Full teacher name must be restored');

    assert.ok(children[2].classList.contains('itmo-sport-badge'), 'Spots badge must be placed at bottom of card');

    // Toggle compact mode back ON
    toggle.checked = true;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 100));

    assert.ok(sportItem.querySelector('.itmo-sport-title-row'), 'title-row must be recreated when compact mode re-enabled');
    assert.ok(sportItem.querySelector('.itmo-sport-meta-row'), 'meta-row must be recreated when compact mode re-enabled');
    assert.equal(sportItem.querySelector('.teacher').textContent, 'Иванов И. И.');
  });

  it('should NEVER treat "АФК и ЛФК", "Настольный теннис", "Фитнес (стретчинг)" as teacher names or shorten them', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-301">
          <div class="sport-item">
            <p>АФК и ЛФК</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-302">
          <div class="sport-item">
            <div>Настольный теннис</div>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-303">
          <div class="sport-item">
            <span class="section-name">Фитнес (стретчинг)</span>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    // Card 301: "АФК и ЛФК"
    const card301 = dom.window.document.getElementById('section-301');
    const text301 = card301.textContent;
    assert.ok(text301.includes('АФК и ЛФК'), '"АФК и ЛФК" must remain in full text');
    assert.equal(text301.includes('АФК И. Л.'), false, '"АФК и ЛФК" must NEVER be corrupted to "АФК И. Л."');
    assert.equal(card301.querySelector('.itmo-sport-teacher'), null, 'Sport element must not be marked as teacher');

    // Card 302: "Настольный теннис"
    const card302 = dom.window.document.getElementById('section-302');
    const text302 = card302.textContent;
    assert.ok(text302.includes('Настольный теннис'), '"Настольный теннис" must remain in full text');
    assert.equal(text302.includes('Настольный Т.'), false, '"Настольный теннис" must NEVER be corrupted to "Настольный Т."');
    assert.equal(card302.querySelector('.itmo-sport-teacher'), null, 'Sport element must not be marked as teacher');

    // Card 303: "Фитнес (стретчинг)"
    const card303 = dom.window.document.getElementById('section-303');
    const text303 = card303.textContent;
    assert.ok(text303.includes('Фитнес (стретчинг)'), '"Фитнес (стретчинг)" must remain intact');
    assert.equal(card303.querySelector('.itmo-sport-teacher'), null, 'Sport element must not be marked as teacher');
  });

  it('should never invert teacher and sport name order even with generic DOM tags and correctly pair teacher with sport in both modes', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-401">
          <div class="sport-item">
            <p>Бадминтон</p>
            <p>Королева Екатерина Александровна</p>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const card = dom.window.document.getElementById('section-401');
    const sportItem = card.querySelector('.sport-item');

    // In compact mode:
    // Line 1: .itmo-sport-title-row should have "Бадминтон" (sport title)
    // Line 2: .itmo-sport-meta-row should have "Королева Е. А." (teacher initials)
    const titleRow = sportItem.querySelector('.itmo-sport-title-row');
    const metaRow = sportItem.querySelector('.itmo-sport-meta-row');
    assert.ok(titleRow, 'title-row must exist');
    assert.ok(metaRow, 'meta-row must exist');

    assert.ok(titleRow.textContent.includes('Бадминтон'), 'Title row must contain the sport name "Бадминтон"');
    assert.equal(titleRow.textContent.includes('Королева'), false, 'Title row must NOT contain teacher name');

    assert.ok(metaRow.textContent.includes('Королева Е. А.'), 'Meta row must contain teacher initials "Королева Е. А."');
    assert.equal(metaRow.textContent.includes('Бадминтон'), false, 'Meta row must NOT contain sport name');

    // Now toggle to standard mode (compactMode: false)
    const toggle = dom.window.document.getElementById('itmo-sport-toggle-compact');
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 100));

    // In standard mode:
    // Layout must be un-wrapped
    assert.equal(sportItem.querySelector('.itmo-sport-title-row'), null);
    assert.equal(sportItem.querySelector('.itmo-sport-meta-row'), null);

    const paragraphs = sportItem.querySelectorAll('p');
    assert.equal(paragraphs.length, 2);
    // Paragraph 1: Sport Name (on top)
    assert.equal(paragraphs[0].textContent.trim(), 'Бадминтон', 'Sport name "Бадминтон" must be on top in standard mode');
    // Paragraph 2: Teacher Name (underneath, in full)
    assert.equal(paragraphs[1].textContent.trim(), 'Королева Екатерина Александровна', 'Teacher full name must be underneath in standard mode');
  });

  it('should accurately identify section name and teacher using Vue lesson component internals', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-501">
          <div class="sport-item">
            <div>АФК и ЛФК</div>
            <div>Королева Екатерина Александровна</div>
          </div>
        </div>
      </div>
    `;

    // Attach mock Vue component to the sport-item
    const card501 = dom.window.document.getElementById('section-501');
    card501.querySelector('.sport-item').__vue__ = {
      lesson: {
        id: 501,
        sport_type: { name: 'АФК и ЛФК' },
        teacher: { fio: 'Королева Екатерина Александровна' }
      }
    };

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const sportItem = card501.querySelector('.sport-item');
    const titleRow = sportItem.querySelector('.itmo-sport-title-row');
    const metaRow = sportItem.querySelector('.itmo-sport-meta-row');

    assert.ok(titleRow.textContent.includes('АФК и ЛФК'), 'Title row must contain "АФК и ЛФК"');
    assert.ok(metaRow.textContent.includes('Королева Е. А.'), 'Meta row must contain "Королева Е. А."');
  });

  it('should never treat multi-word capitalized sports disciplines as teachers or shorten them', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-601">
          <div class="sport-item">
            <p>Водное Поло</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-602">
          <div class="sport-item">
            <p>Конный Спорт</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-603">
          <div class="sport-item">
            <p>Рукопашный Бой</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-604">
          <div class="sport-item">
            <p>Спортивное Ориентирование</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-605">
          <div class="sport-item">
            <p>Фигурное Катание</p>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    // Check each card: must NOT have teacher element, must NOT shorten to initials, must put sport in title row
    const testCases = [
      { id: 'section-601', name: 'Водное Поло', forbidden: 'Водное П.' },
      { id: 'section-602', name: 'Конный Спорт', forbidden: 'Конный С.' },
      { id: 'section-603', name: 'Рукопашный Бой', forbidden: 'Рукопашный Б.' },
      { id: 'section-604', name: 'Спортивное Ориентирование', forbidden: 'Спортивное О.' },
      { id: 'section-605', name: 'Фигурное Катание', forbidden: 'Фигурное К.' }
    ];

    for (const tc of testCases) {
      const card = dom.window.document.getElementById(tc.id);
      const text = card.textContent;
      assert.ok(text.includes(tc.name), `"${tc.name}" must remain intact in card`);
      assert.equal(text.includes(tc.forbidden), false, `"${tc.name}" must NEVER be abbreviated to "${tc.forbidden}"`);
      assert.equal(card.querySelector('.itmo-sport-teacher'), null, `Card for "${tc.name}" must not have a teacher element`);

      const titleRow = card.querySelector('.itmo-sport-title-row');
      assert.ok(titleRow, `Title row must exist for "${tc.name}"`);
      assert.ok(titleRow.textContent.includes(tc.name), `Title row must contain "${tc.name}"`);

      // Without teacher and without multi-building, meta-row should NOT be created
      assert.equal(card.querySelector('.itmo-sport-meta-row'), null, `Meta row should not be created for standalone "${tc.name}"`);
    }
  });

  it('should correctly pair multi-word sport with teacher and never invert even when teacher is first in DOM', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-701">
          <div class="sport-item">
            <p>Водное Поло</p>
            <p>Королева Екатерина Александровна</p>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-702">
          <div class="sport-item">
            <p>Королева Екатерина Александровна</p>
            <p>Фехтование</p>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    // Section 701: Sport first, Teacher second
    const card701 = dom.window.document.getElementById('section-701');
    const title701 = card701.querySelector('.itmo-sport-title-row');
    const meta701 = card701.querySelector('.itmo-sport-meta-row');
    assert.ok(title701.textContent.includes('Водное Поло'), 'Title row must contain "Водное Поло"');
    assert.equal(title701.textContent.includes('Королева'), false, 'Title row must NOT contain teacher');
    assert.ok(meta701.textContent.includes('Королева Е. А.'), 'Meta row must contain teacher initials "Королева Е. А."');
    assert.equal(meta701.textContent.includes('Водное Поло'), false, 'Meta row must NOT contain sport');

    // Section 702: Teacher first in DOM, Sport second
    const card702 = dom.window.document.getElementById('section-702');
    const title702 = card702.querySelector('.itmo-sport-title-row');
    const meta702 = card702.querySelector('.itmo-sport-meta-row');
    assert.ok(title702.textContent.includes('Фехтование'), 'Title row must contain "Фехтование" despite DOM inversion');
    assert.equal(title702.textContent.includes('Королева'), false, 'Title row must NOT contain teacher');
    assert.ok(meta702.textContent.includes('Королева Е. А.'), 'Meta row must contain teacher initials "Королева Е. А."');
    assert.equal(meta702.textContent.includes('Фехтование'), false, 'Meta row must NOT contain sport');
  });

  it('should correctly format teachers with academic and coaching title prefixes ending in dots', async () => {
    const row = dom.window.document.querySelector('.el-calendar-row');
    row.innerHTML += `
      <div class="day-cell">
        <div class="section-block" id="section-801">
          <div class="sport-item">
            <span class="section-name">Теннис</span>
            <span class="teacher">доц. Иванов Иван Иванович</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-802">
          <div class="sport-item">
            <span class="section-name">Теннис</span>
            <span class="teacher">ст. преп. Королева Екатерина Александровна</span>
          </div>
        </div>
      </div>
      <div class="day-cell">
        <div class="section-block" id="section-803">
          <div class="sport-item">
            <span class="section-name">Теннис</span>
            <span class="teacher">тренер Петров П. П.</span>
          </div>
        </div>
      </div>
    `;

    loadScript(dom, 'content/page-bridge.js');
    await new Promise(r => setTimeout(r, 150));

    const card801 = dom.window.document.getElementById('section-801');
    assert.ok(card801.querySelector('.itmo-sport-meta-row').textContent.includes('Иванов И. И.'));

    const card802 = dom.window.document.getElementById('section-802');
    assert.ok(card802.querySelector('.itmo-sport-meta-row').textContent.includes('Королева Е. А.'));

    const card803 = dom.window.document.getElementById('section-803');
    assert.ok(card803.querySelector('.itmo-sport-meta-row').textContent.includes('Петров П. П.'));
  });
});
