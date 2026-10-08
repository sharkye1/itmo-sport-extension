(() => {
  if (window.__ITMO_SPORT_BRIDGE_LOADED__) return;
  window.__ITMO_SPORT_BRIDGE_LOADED__ = true;

  const state = {
    settings: {
      hideZeroSpots: true,
      showBadges: true
    },
    limits: {},
    lessonGroupMap: {},
    stats: {
      total: 0,
      available: 0,
      hidden: 0
    }
  };

  let updateTimer = null;
  let isStoreSubscribed = false;

  function scheduleUpdateUI(delay = 50) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      syncFromNuxtStore();
      updateInPageSwitcher();
      updateCards();
    }, delay);
  }

  function parseScheduleResponse(data) {
    if (!data?.result || !Array.isArray(data.result)) return;
    data.result.forEach(day => {
      if (Array.isArray(day?.lessons)) {
        day.lessons.forEach(lesson => {
          if (lesson?.id && lesson?.lesson_group_id) {
            state.lessonGroupMap[String(lesson.id)] = String(lesson.lesson_group_id);
          }
        });
      }
    });
  }

  function parseLimitsResponse(data) {
    if (!data?.result || typeof data.result !== 'object') return;
    for (const [groupId, lessons] of Object.entries(data.result)) {
      if (!state.limits[groupId]) {
        state.limits[groupId] = {};
      }
      Object.assign(state.limits[groupId], lessons);
      for (const lessonId of Object.keys(lessons)) {
        state.lessonGroupMap[String(lessonId)] = String(groupId);
      }
    }
  }

  // Intercept XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._itmoUrl = url ? String(url) : '';
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', () => {
      try {
        if (!this._itmoUrl) return;
        if (this._itmoUrl.includes('/api/sport/sign/schedule/limits')) {
          parseLimitsResponse(JSON.parse(this.responseText));
          scheduleUpdateUI(30);
        } else if (this._itmoUrl.includes('/api/sport/sign/schedule')) {
          parseScheduleResponse(JSON.parse(this.responseText));
          scheduleUpdateUI(30);
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

  // Intercept Fetch API
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (url.includes('/api/sport/sign/schedule/limits')) {
        res.clone().json().then(data => {
          parseLimitsResponse(data);
          scheduleUpdateUI(30);
        }).catch(() => {});
      } else if (url.includes('/api/sport/sign/schedule')) {
        res.clone().json().then(data => {
          parseScheduleResponse(data);
          scheduleUpdateUI(30);
        }).catch(() => {});
      }
    } catch (e) {}
    return res;
  };

  function syncFromNuxtStore() {
    try {
      const store = window.$nuxt?.$store;
      if (!store) return;

      const storeLimits = store.state?.['modules/sport']?.limits?.limits ||
                          store.getters?.['modules/sport/limits/limits'];
      if (storeLimits) {
        parseLimitsResponse({ result: storeLimits });
      }

      const schedule = store.state?.['modules/sport']?.sections?.sectionsSchedule ||
                       store.getters?.['modules/sport/sections/sectionsSchedule'];
      if (Array.isArray(schedule)) {
        parseScheduleResponse({ result: schedule });
      }

      if (!isStoreSubscribed) {
        isStoreSubscribed = true;
        store.subscribe((mutation) => {
          const type = mutation?.type || '';
          if (type.includes('Limit') || type.includes('Schedule') || type.includes('sport')) {
            scheduleUpdateUI(40);
          }
        });
      }
    } catch (e) {}
  }

  function getLimitForLesson(lessonId) {
    lessonId = String(lessonId);

    let groupId = state.lessonGroupMap[lessonId];
    if (groupId && state.limits[groupId]?.[lessonId]) {
      return state.limits[groupId][lessonId];
    }

    for (const [gid, lessons] of Object.entries(state.limits)) {
      if (lessons?.[lessonId]) {
        state.lessonGroupMap[lessonId] = String(gid);
        return lessons[lessonId];
      }
    }

    const card = document.getElementById('section-' + lessonId);
    if (card) {
      const vueComp = card.querySelector('.sport-item')?.__vue__ || card.__vue__;
      const lessonObj = vueComp?.lesson;
      if (lessonObj?.lesson_group_id) {
        groupId = String(lessonObj.lesson_group_id);
        state.lessonGroupMap[lessonId] = groupId;
        if (state.limits[groupId]?.[lessonId]) {
          return state.limits[groupId][lessonId];
        }
      }
    }

    return null;
  }

  function updateCards() {
    const cards = document.querySelectorAll('.section-block');
    let totalCount = 0;
    let availableCount = 0;
    let hiddenCount = 0;

    cards.forEach(card => {
      const sportItem = card.querySelector('.sport-item');
      if (!sportItem) return;

      totalCount++;
      const lessonId = card.id.replace('section-', '');
      const limitData = getLimitForLesson(lessonId);

      if (limitData !== null && typeof limitData.available === 'number') {
        const available = Math.max(0, limitData.available);
        const limit = Math.max(0, limitData.limit || 0);

        let badge = card.querySelector('.itmo-sport-badge');
        if (state.settings.showBadges) {
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'itmo-sport-badge';
            sportItem.appendChild(badge);
          }
          if (available > 0) {
            badge.className = 'itmo-sport-badge itmo-sport-badge-available';
            badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> ${available} / ${limit} мест`;
          } else {
            badge.className = 'itmo-sport-badge itmo-sport-badge-empty';
            badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> 0 / ${limit} мест`;
          }
        } else if (badge) {
          badge.remove();
        }

        if (state.settings.hideZeroSpots && available <= 0) {
          card.classList.add('itmo-sport-hidden-card');
          hiddenCount++;
        } else {
          card.classList.remove('itmo-sport-hidden-card');
          availableCount++;
        }
      } else {
        card.classList.remove('itmo-sport-hidden-card');
        availableCount++;
      }
    });

    state.stats = {
      total: totalCount,
      available: availableCount,
      hidden: hiddenCount
    };

    updateBadgeInSwitcher();
    notifyContentScript();
  }

  function updateInPageSwitcher() {
    const existingSwitcher = document.querySelector('.switcher');
    if (!existingSwitcher?.parentElement) return;

    let customWrapper = document.querySelector('.itmo-sport-switch-wrapper');
    if (!customWrapper) {
      customWrapper = document.createElement('div');
      customWrapper.className = 'itmo-sport-switch-wrapper';
      customWrapper.innerHTML = `
        <label class="switcher itmo-sport-inpage-switcher" title="Скрывать занятия, где 0 свободных мест">
          <input type="checkbox" class="switcher-input" id="itmo-sport-inpage-toggle">
          <span class="switcher-indicator">
            <span class="switcher-yes"></span>
            <span class="switcher-no"></span>
          </span>
          <span class="switcher-label">
            Только с местами (> 0)
            <span class="badge-count" style="display: none;">0</span>
          </span>
        </label>
      `;

      existingSwitcher.parentElement.appendChild(customWrapper);

      const toggleInput = customWrapper.querySelector('#itmo-sport-inpage-toggle');
      toggleInput.checked = !!state.settings.hideZeroSpots;

      toggleInput.addEventListener('change', (e) => {
        state.settings.hideZeroSpots = e.target.checked;
        scheduleUpdateUI(20);
        window.postMessage({
          type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
          setting: 'hideZeroSpots',
          value: e.target.checked
        }, '*');
      });
    } else {
      const toggleInput = customWrapper.querySelector('#itmo-sport-inpage-toggle');
      if (toggleInput && toggleInput.checked !== !!state.settings.hideZeroSpots) {
        toggleInput.checked = !!state.settings.hideZeroSpots;
      }
    }
  }

  function updateBadgeInSwitcher() {
    const countBadge = document.querySelector('.itmo-sport-inpage-switcher .badge-count');
    if (countBadge) {
      if (state.settings.hideZeroSpots && state.stats.hidden > 0) {
        countBadge.style.display = 'inline-block';
        countBadge.innerText = `скрыто: ${state.stats.hidden}`;
      } else {
        countBadge.style.display = 'none';
      }
    }
  }

  function notifyContentScript() {
    window.postMessage({
      type: 'ITMO_SPORT_BRIDGE_STATS_UPDATE',
      stats: state.stats
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ITMO_SPORT_UPDATE_SETTINGS') {
      if (event.data.settings) {
        Object.assign(state.settings, event.data.settings);
        scheduleUpdateUI(20);
      }
    } else if (event.data.type === 'ITMO_SPORT_REQUEST_STATS') {
      notifyContentScript();
    }
  });

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
        scheduleUpdateUI(50);
        break;
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleUpdateUI(100);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleUpdateUI(100);
    });
  }

  let nuxtCheckAttempts = 0;
  const nuxtInterval = setInterval(() => {
    nuxtCheckAttempts++;
    if (window.$nuxt?.$store) {
      syncFromNuxtStore();
      scheduleUpdateUI(50);
      clearInterval(nuxtInterval);
    } else if (nuxtCheckAttempts > 30) {
      clearInterval(nuxtInterval);
    }
  }, 300);
})();
