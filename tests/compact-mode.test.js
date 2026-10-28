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
});
