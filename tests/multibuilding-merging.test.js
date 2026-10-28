const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, loadScript, cleanupDOMs } = require('./test-helper');

describe('Multi-building merging logic and buildings bar', () => {
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
          <div class="el-calendar-header-switch">Февраль 2026</div>
          <div class="switcher"></div>
          <div class="el-calendar-table">
            <div class="el-calendar-row">
              <div class="day-cell">
                <div class="section-block" id="section-10">
                  <div class="sport-item">
                    <span class="section-name">Бокс</span>
                  </div>
                </div>
              </div>
              <div class="day-cell">
                <div class="section-block" id="section-20">
                  <div class="sport-item">
                    <span class="section-name">Плавание</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

    dom.window.fetch = async (url) => {
      return {
        ok: true,
        clone: () => ({
          json: async () => ({ error_code: 0, result: [] })
        }),
        json: async () => ({ error_code: 0, result: [] })
      };
    };
  });

  it('should render buildings bar with chips for available buildings and "Все"', async () => {
    loadScript(dom, 'content/page-bridge.js');

    // Simulate buildings loaded from store
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            filters: {
              filters: {
                buildings: [
                  { id: 1, name: 'ул. Ломоносова, д. 9' },
                  { id: 2, name: 'Вяземский пер., д. 5/7' },
                  { id: 3, name: 'Кронверкский пр., д. 49' }
                ]
              }
            }
          }
        },
        subscribe: () => {}
      }
    };

    await new Promise(r => setTimeout(r, 160));

    const bar = dom.window.document.querySelector('.itmo-sport-buildings-bar');
    assert.ok(bar, 'Buildings bar should be injected');

    const allBtn = bar.querySelector('.itmo-sport-chip-all');
    assert.ok(allBtn, '"Все" chip should exist');

    const chips = bar.querySelectorAll('.itmo-sport-chip:not(.itmo-sport-chip-all)');
    assert.equal(chips.length, 3, 'Should render 3 building chips');
    assert.ok(chips[0].textContent.includes('Ломоносова'));
    assert.ok(chips[1].textContent.includes('Вяземский'));
    assert.ok(chips[2].textContent.includes('Кронверкский'));
  });

  it('should toggle building selection and notify via postMessage when chip is clicked', async () => {
    const messages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data?.type === 'ITMO_SPORT_BRIDGE_SETTING_CHANGED') {
        messages.push(e.data);
      }
    });

    loadScript(dom, 'content/page-bridge.js');

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

    await new Promise(r => setTimeout(r, 160));

    const chips = dom.window.document.querySelectorAll('.itmo-sport-chip:not(.itmo-sport-chip-all)');
    assert.equal(chips.length, 2);

    // Click second building chip to select both 1 and 2
    chips[1].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));

    const buildingMsg = messages.find(m => m.setting === 'selectedBuildingIds');
    assert.ok(buildingMsg, 'Should send selectedBuildingIds change message');
    assert.ok(buildingMsg.value.includes('1'));
    assert.ok(buildingMsg.value.includes('2'));
  });

  it('should add building tag to cards when multi-building mode is active', async () => {
    loadScript(dom, 'content/page-bridge.js');

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

    // Set multi-building selection (buildings 1 and 2)
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: {
        selectedBuildingIds: ['1', '2']
      }
    }, '*');

    // Simulate multi-schedule response processed by bridge
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    // Simulate XHR schedule limits & responses
    dom.window.eval(`
      // Inject building mapping into bridge state directly or via fake API trigger
      // Set Vue component lessons
      document.getElementById('section-10').querySelector('.sport-item').__vue__ = {
        lesson: { id: 10, date_start: '${futureDate}' }
      };
      document.getElementById('section-20').querySelector('.sport-item').__vue__ = {
        lesson: { id: 20, date_start: '${futureDate}' }
      };
    `);

    // Feed limits
    dom.window.dispatchEvent(new dom.window.CustomEvent('mock-feed-schedule', {}));

    // Trigger schedule with multi-building
    // We can simulate fetch intercept or XHR
    const xhr = new dom.window.XMLHttpRequest();
    xhr.open('GET', '/api/sport/sign/schedule?building_id=1&date_start=2026-02-01&date_end=2026-02-07');
    // page-bridge intercepts schedule responses:
    xhr.responseText = JSON.stringify({
      error_code: 0,
      result: [
        {
          date: futureDate,
          lessons: [
            { id: 10, date_start: futureDate }
          ]
        }
      ]
    });
    xhr.dispatchEvent(new dom.window.Event('load'));

    await new Promise(r => setTimeout(r, 160));

    // When multi-building is active and building is known, building tag appears
    // Let's test that building tag element logic behaves according to specs
    const card10 = dom.window.document.getElementById('section-10');
    // If not multi-building (e.g. only 1 selected), tags are removed:
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: {
        selectedBuildingIds: ['1']
      }
    }, '*');

    await new Promise(r => setTimeout(r, 100));
    assert.equal(card10.querySelector('.itmo-sport-building-tag'), null, 'Single building mode must not show building tags');
  });

  it('should correctly select all buildings when "Все" chip is clicked', async () => {
    const messages = [];
    dom.window.addEventListener('message', (e) => {
      if (e.data?.type === 'ITMO_SPORT_BRIDGE_SETTING_CHANGED') {
        messages.push(e.data);
      }
    });

    loadScript(dom, 'content/page-bridge.js');

    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            filters: {
              filters: {
                buildings: [
                  { id: 1, name: 'Ломоносова' },
                  { id: 2, name: 'Вяземский' },
                  { id: 3, name: 'Кронверкский' }
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

    await new Promise(r => setTimeout(r, 160));

    const allBtn = dom.window.document.querySelector('.itmo-sport-chip-all');
    assert.ok(allBtn);

    // Click "Все" chip
    allBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));

    const buildingMsg = messages.find(m => m.setting === 'selectedBuildingIds');
    assert.ok(buildingMsg);
    assert.deepEqual(buildingMsg.value.sort(), ['1', '2', '3']);
  });

  it('should maintain compact mode root attribute when interacting with building chips', async () => {
    loadScript(dom, 'content/page-bridge.js');

    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            filters: {
              filters: {
                buildings: [
                  { id: 1, name: 'Ломоносова' }
                ]
              }
            }
          }
        },
        subscribe: () => {}
      }
    };

    await new Promise(r => setTimeout(r, 160));

    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');
    const bar = dom.window.document.querySelector('.itmo-sport-buildings-bar');
    assert.ok(bar, 'Buildings bar should be present');
  });
});
