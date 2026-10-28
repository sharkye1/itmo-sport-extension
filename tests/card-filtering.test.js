const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createDOM, loadScript, cleanupDOMs } = require('./test-helper');

describe('Card filtering (zero spots, past lessons, intersections) & Compact mode integration', () => {
  let dom;

  afterEach(() => {
    cleanupDOMs();
  });

  beforeEach(() => {
    // Current time fixed or relative
    dom = createDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div class="filters-panel">
            <div class="switcher"></div>
          </div>
          <div class="el-calendar-table">
            <div class="el-calendar-row">
              <!-- Lesson 1: Future, Available spots -->
              <div class="day-cell">
                <div class="section-block" id="section-1">
                  <div class="sport-item">
                    <span class="section-name">Баскетбол</span>
                  </div>
                </div>
              </div>

              <!-- Lesson 2: Future, Zero spots -->
              <div class="day-cell">
                <div class="section-block" id="section-2">
                  <div class="sport-item">
                    <span class="section-name">Плавание</span>
                  </div>
                </div>
              </div>

              <!-- Lesson 3: Past lesson -->
              <div class="day-cell">
                <div class="section-block" id="section-3">
                  <div class="sport-item">
                    <span class="section-name">Волейбол</span>
                  </div>
                </div>
              </div>

              <!-- Lesson 4: Future, with Schedule Intersection -->
              <div class="day-cell">
                <div class="section-block" id="section-4">
                  <div class="sport-item">
                    <span class="section-name">Теннис</span>
                    <span class="red_circle"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
  });

  function setupTestData(dom) {
    const futureDate = new Date(Date.now() + 86400000); // Tomorrow
    const pastDate = new Date(Date.now() - 86400000);   // Yesterday

    // Simulate Vue component or API limits and schedule responses
    dom.window.eval(`
      // Attach mock vue data to cards
      document.getElementById('section-1').querySelector('.sport-item').__vue__ = {
        lesson: { id: 1, date_start: '${futureDate.toISOString()}', intersection: false }
      };
      document.getElementById('section-2').querySelector('.sport-item').__vue__ = {
        lesson: { id: 2, date_start: '${futureDate.toISOString()}', intersection: false }
      };
      document.getElementById('section-3').querySelector('.sport-item').__vue__ = {
        lesson: { id: 3, date_start: '${pastDate.toISOString()}', intersection: false }
      };
      document.getElementById('section-4').querySelector('.sport-item').__vue__ = {
        lesson: { id: 4, date_start: '${futureDate.toISOString()}', intersection: true }
      };
    `);
  }

  it('should hide cards with 0 spots and past lessons by default when hideZeroSpots: true', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    // Feed limits data via XHR/fetch mock simulation
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    // Trigger schedule & limits parsing directly via mock Nuxt store
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                'g1': {
                  '1': { limit: 20, available: 5 },
                  '2': { limit: 20, available: 0 },
                  '3': { limit: 20, available: 10 },
                  '4': { limit: 20, available: 8 }
                }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: futureDate,
                  lessons: [
                    { id: 1, date_start: futureDate, intersection: false },
                    { id: 2, date_start: futureDate, intersection: false },
                    { id: 4, date_start: futureDate, intersection: true }
                  ]
                },
                {
                  date: pastDate,
                  lessons: [
                    { id: 3, date_start: pastDate, intersection: false }
                  ]
                }
              ]
            }
          }
        },
        subscribe: () => {}
      }
    };

    await new Promise(r => setTimeout(r, 160));

    const card1 = dom.window.document.getElementById('section-1');
    const card2 = dom.window.document.getElementById('section-2');
    const card3 = dom.window.document.getElementById('section-3');
    const card4 = dom.window.document.getElementById('section-4');

    // Card 1 (available, future) -> VISIBLE
    assert.equal(card1.classList.contains('itmo-sport-hidden-card'), false, 'Card 1 should be visible');
    // Card 2 (zero spots) -> HIDDEN
    assert.equal(card2.classList.contains('itmo-sport-hidden-card'), true, 'Card 2 (0 spots) should be hidden');
    // Card 3 (past) -> HIDDEN
    assert.equal(card3.classList.contains('itmo-sport-hidden-card'), true, 'Card 3 (past) should be hidden');
    // Card 4 (available, intersection, hideIntersections=false) -> VISIBLE
    assert.equal(card4.classList.contains('itmo-sport-hidden-card'), false, 'Card 4 should be visible when hideIntersections is false');

    // Both compactMode and filtering operate together
    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');
  });

  it('should show cards with 0 spots and dim past lessons when hideZeroSpots: false', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                'g1': {
                  '1': { limit: 20, available: 5 },
                  '2': { limit: 20, available: 0 },
                  '3': { limit: 20, available: 10 }
                }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: futureDate,
                  lessons: [
                    { id: 1, date_start: futureDate },
                    { id: 2, date_start: futureDate }
                  ]
                },
                {
                  date: pastDate,
                  lessons: [
                    { id: 3, date_start: pastDate }
                  ]
                }
              ]
            }
          }
        },
        subscribe: () => {}
      }
    };

    // Update settings: disable hideZeroSpots
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { hideZeroSpots: false }
    }, '*');

    await new Promise(r => setTimeout(r, 160));

    const card2 = dom.window.document.getElementById('section-2');
    const card3 = dom.window.document.getElementById('section-3');

    // Card 2 (0 spots) should now be visible
    assert.equal(card2.classList.contains('itmo-sport-hidden-card'), false);
    // Card 3 (past) should be visible but have past card dimming class
    assert.equal(card3.classList.contains('itmo-sport-hidden-card'), false);
    assert.equal(card3.classList.contains('itmo-sport-past-card'), true);
  });

  it('should hide intersection cards when hideIntersections: true', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                'g1': {
                  '4': { limit: 20, available: 10 }
                }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: futureDate,
                  lessons: [{ id: 4, date_start: futureDate, intersection: true }]
                }
              ]
            }
          }
        },
        subscribe: () => {}
      }
    };

    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { hideIntersections: true }
    }, '*');

    await new Promise(r => setTimeout(r, 160));

    const card4 = dom.window.document.getElementById('section-4');
    assert.equal(card4.classList.contains('itmo-sport-hidden-card'), true, 'Intersection card should be hidden');
  });

  it('should render spots badge with correct count and status classes', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                'g1': {
                  '1': { limit: 25, available: 7 }
                }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: futureDate,
                  lessons: [{ id: 1, date_start: futureDate }]
                }
              ]
            }
          }
        },
        subscribe: () => {}
      }
    };

    await new Promise(r => setTimeout(r, 160));

    const card1 = dom.window.document.getElementById('section-1');
    const badge = card1.querySelector('.itmo-sport-badge');
    assert.ok(badge, 'Badge should be rendered');
    assert.ok(badge.classList.contains('itmo-sport-badge-available'), 'Should have available badge class');
    assert.ok(badge.textContent.includes('7 / 25'), 'Badge should display 7 / 25 мест');
  });

  it('should remove badges if showBadges setting is disabled', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { showBadges: false }
    }, '*');

    await new Promise(r => setTimeout(r, 160));

    const badge = dom.window.document.querySelector('.itmo-sport-badge');
    assert.equal(badge, null, 'Badges should be removed when showBadges is false');
  });

  it('should maintain card layout integrity in compact mode with badges and intersection indicator', async () => {
    setupTestData(dom);
    loadScript(dom, 'content/page-bridge.js');

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    dom.window.$nuxt = {
      $store: {
        state: {
          'modules/sport': {
            limits: {
              limits: {
                'g1': {
                  '4': { limit: 15, available: 3 }
                }
              }
            },
            sections: {
              sectionsSchedule: [
                {
                  date: futureDate,
                  lessons: [{ id: 4, date_start: futureDate, intersection: true }]
                }
              ]
            }
          }
        },
        subscribe: () => {}
      }
    };

    // Keep compactMode: true, hideIntersections: false
    dom.window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings: { compactMode: true, hideIntersections: false, showBadges: true }
    }, '*');

    await new Promise(r => setTimeout(r, 160));

    const card4 = dom.window.document.getElementById('section-4');
    assert.equal(card4.classList.contains('itmo-sport-hidden-card'), false);

    const badge = card4.querySelector('.itmo-sport-badge');
    assert.ok(badge, 'Badge should exist on card 4');
    assert.ok(badge.textContent.includes('3 / 15'));

    const redCircle = card4.querySelector('.red_circle');
    assert.ok(redCircle, 'Intersection red_circle dot should remain present');

    assert.equal(dom.window.document.documentElement.getAttribute('data-itmo-compact'), 'true');
  });
});
