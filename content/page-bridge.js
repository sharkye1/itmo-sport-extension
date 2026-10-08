(() => {
  if (window.__ITMO_SPORT_BRIDGE_LOADED__) return;
  window.__ITMO_SPORT_BRIDGE_LOADED__ = true;

  const RU_MONTHS = {
    'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3,
    'май': 4, 'мае': 4, 'мая': 4, 'июн': 5, 'июл': 6,
    'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
  };

  const state = {
    settings: {
      hideZeroSpots: true,
      hideIntersections: false,
      showBadges: true,
      selectedBuildingIds: []
    },
    availableBuildings: [],
    lessonBuildings: {},
    limits: {},
    lessonGroupMap: {},
    lessonDates: {},
    lessonIntersections: {},
    stats: {
      total: 0,
      available: 0,
      hidden: 0
    }
  };

  let updateTimer = null;
  let isStoreSubscribed = false;
  let isInternalScheduleUpdate = false;
  let isLoadingMultiSchedule = false;

  function scheduleUpdateUI(delay = 50) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      syncFromNuxtStore();
      updateInPageSwitcher();
      updateBuildingsBar();
      updateCards();
    }, delay);
  }

  function getShortBuildingName(name) {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower.includes('ломонос')) return 'Ломоносова';
    if (lower.includes('вяземск')) return 'Вяземский';
    if (lower.includes('кронверк')) return 'Кронверкский';
    if (lower.includes('чайковск')) return 'Чайковского';
    if (lower.includes('гривцов')) return 'Гривцова';
    if (lower.includes('сторонн')) return 'Сторонние';
    return name.split(',')[0].replace(/^(ул\.|пер\.|пр\.)\s*/i, '').trim();
  }

  function parseLessonDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      const iso = trimmed.replace(' ', 'T');
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;

      const m = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
      if (m) {
        return new Date(
          parseInt(m[1], 10),
          parseInt(m[2], 10) - 1,
          parseInt(m[3], 10),
          m[4] ? parseInt(m[4], 10) : 0,
          m[5] ? parseInt(m[5], 10) : 0
        );
      }
    }
    return null;
  }

  function parseFiltersResponse(data) {
    if (data?.error_code === 0 && Array.isArray(data?.result?.buildings)) {
      state.availableBuildings = data.result.buildings;
      syncSelectedBuildings();
      updateBuildingsBar();
    }
  }

  function parseScheduleResponse(data) {
    if (!data?.result || !Array.isArray(data.result)) return;
    data.result.forEach(day => {
      const dayDate = day?.date ? String(day.date).split('T')[0].split(' ')[0] : null;
      if (Array.isArray(day?.lessons)) {
        day.lessons.forEach(lesson => {
          if (!lesson?.id) return;
          const lessonId = String(lesson.id);
          if (lesson.lesson_group_id) {
            state.lessonGroupMap[lessonId] = String(lesson.lesson_group_id);
          }

          state.lessonIntersections[lessonId] = !!lesson.intersection;

          let dateStart = parseLessonDate(lesson.date_start);
          if (!dateStart && dayDate && lesson.time_slot_start) {
            dateStart = parseLessonDate(`${dayDate}T${lesson.time_slot_start}:00`);
          }

          let dateEnd = parseLessonDate(lesson.date_end);
          if (!dateEnd && dayDate && lesson.time_slot_end) {
            dateEnd = parseLessonDate(`${dayDate}T${lesson.time_slot_end}:00`);
          }

          state.lessonDates[lessonId] = { dateStart, dateEnd };
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
        } else if (this._itmoUrl.includes('/api/sport/sign/schedule/filters')) {
          parseFiltersResponse(JSON.parse(this.responseText));
        } else if (this._itmoUrl.includes('/api/sport/sign/schedule')) {
          parseScheduleResponse(JSON.parse(this.responseText));
          scheduleUpdateUI(30);
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

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
      } else if (url.includes('/api/sport/sign/schedule/filters')) {
        res.clone().json().then(data => {
          parseFiltersResponse(data);
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

  function syncSelectedBuildings() {
    const store = window.$nuxt?.$store;
    const currentBuildingId = store?.state?.['modules/sport']?.filters?.currentFilters?.building?.id;
    if (!state.settings.selectedBuildingIds || state.settings.selectedBuildingIds.length === 0) {
      if (currentBuildingId) {
        state.settings.selectedBuildingIds = [String(currentBuildingId)];
      } else if (state.availableBuildings.length > 0) {
        state.settings.selectedBuildingIds = [String(state.availableBuildings[0].id)];
      }
    }
  }

  function syncFromNuxtStore() {
    try {
      const store = window.$nuxt?.$store;
      if (!store) return;

      const storeBuildings = store.state?.['modules/sport']?.filters?.filters?.buildings ||
                             store.state?.['modules/sport']?.filters?.availableFilters?.buildings;
      if (Array.isArray(storeBuildings) && storeBuildings.length > 0 && state.availableBuildings.length === 0) {
        state.availableBuildings = storeBuildings;
        syncSelectedBuildings();
        updateBuildingsBar();
      }

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

          if (type.includes('updateSectionSchedule') && !isInternalScheduleUpdate) {
            if (state.settings.selectedBuildingIds && state.settings.selectedBuildingIds.length > 1) {
              setTimeout(() => loadMultiBuildingSchedule(), 30);
            }
          }

          if (type.includes('Limit') || type.includes('Schedule') || type.includes('sport')) {
            scheduleUpdateUI(40);
          }
        });
      }
    } catch (e) {}
  }

  function mergeBuildingSchedules(results) {
    const daysMap = {};
    const seenLessonIds = new Set();

    results.forEach(({ buildingId, data }) => {
      if (data?.error_code === 0 && Array.isArray(data.result)) {
        const bObj = state.availableBuildings.find(b => String(b.id) === String(buildingId));
        const bShort = getShortBuildingName(bObj?.name);

        data.result.forEach(day => {
          if (!day?.date) return;
          const dateKey = String(day.date).split('T')[0].split(' ')[0];
          if (!daysMap[dateKey]) {
            daysMap[dateKey] = {
              date: day.date,
              lessons: []
            };
          }

          if (Array.isArray(day.lessons)) {
            day.lessons.forEach(lesson => {
              if (lesson?.id && !seenLessonIds.has(lesson.id)) {
                seenLessonIds.add(lesson.id);
                if (bShort) {
                  state.lessonBuildings[String(lesson.id)] = bShort;
                }
                daysMap[dateKey].lessons.push(lesson);
              }
            });
          }
        });
      }
    });

    const merged = Object.values(daysMap);
    parseScheduleResponse({ result: merged });
    return merged;
  }

  async function loadMultiBuildingSchedule(customDates = null) {
    if (isLoadingMultiSchedule) return;
    const buildingIds = state.settings.selectedBuildingIds;
    if (!buildingIds || buildingIds.length <= 1) return;

    const store = window.$nuxt?.$store;
    if (!store) return;

    const dates = customDates || store.state?.['modules/sport']?.sections?.dates;
    if (!dates?.date_start || !dates?.date_end) return;

    isLoadingMultiSchedule = true;

    try {
      const currentFilters = store.state?.['modules/sport']?.filters?.currentFilters || {};
      const sportTypes = currentFilters.sportType || [];
      const teachers = currentFilters.teachers || [];

      const promises = buildingIds.map(async (bId) => {
        const params = new URLSearchParams();
        params.append('building_id', bId);
        params.append('date_start', dates.date_start);
        params.append('date_end', dates.date_end);
        sportTypes.forEach(st => params.append('sport_type_id', st.id));
        teachers.forEach(t => params.append('teacher_isu', t.id));

        const res = await fetch(`/api/sport/sign/schedule?${params.toString()}`);
        const json = await res.json();
        return { buildingId: bId, data: json };
      });

      const results = await Promise.all(promises);
      const merged = mergeBuildingSchedules(results);

      isInternalScheduleUpdate = true;
      store.commit('modules/sport/sections/updateSectionSchedule', merged);
      isInternalScheduleUpdate = false;

      scheduleUpdateUI(30);
    } catch (err) {
      console.warn('[ITMO Sport] Multi-building schedule error:', err);
    } finally {
      isLoadingMultiSchedule = false;
    }
  }

  function getDateFromDom(card) {
    try {
      const dayCell = card.closest('.day-cell') || card.closest('.el-calendar-cell');
      if (!dayCell) return null;

      const row = dayCell.closest('.el-calendar-row');
      if (!row) return null;

      const timeStartEl = row.querySelector('.time-start') || row.querySelector('.time-cell');
      const timeText = timeStartEl ? timeStartEl.innerText.trim() : '';
      const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
      const hour = timeMatch ? parseInt(timeMatch[1], 10) : 0;
      const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;

      const rowDayCells = Array.from(row.querySelectorAll('.day-cell, .el-calendar-cell')).filter(c => !c.classList.contains('time-cell'));
      const colIndex = rowDayCells.indexOf(dayCell);
      if (colIndex === -1) return null;

      const headRow = document.querySelector('.el-calendar-row-head');
      if (!headRow) return null;
      const headDayCells = Array.from(headRow.querySelectorAll('.day-cell, .column-heading')).filter(c => !c.classList.contains('time-cell'));
      const headCell = headDayCells[colIndex];
      if (!headCell) return null;

      const dayMatch = headCell.innerText.match(/(\d{1,2})/);
      if (!dayMatch) return null;
      const dayNum = parseInt(dayMatch[1], 10);

      const headerSwitch = document.querySelector('.el-calendar-header-switch') || document.querySelector('.card-body');
      const switchText = headerSwitch ? headerSwitch.innerText : '';
      let monthIdx = new Date().getMonth();
      const lower = switchText.toLowerCase();
      for (const [key, mIdx] of Object.entries(RU_MONTHS)) {
        if (lower.includes(key)) {
          monthIdx = mIdx;
          break;
        }
      }

      const now = new Date();
      let year = now.getFullYear();
      if (now.getMonth() === 0 && monthIdx === 11) year--;
      else if (now.getMonth() === 11 && monthIdx === 0) year++;

      return new Date(year, monthIdx, dayNum, hour, minute);
    } catch (e) {
      return null;
    }
  }

  function isLessonInPast(lessonId, card) {
    const now = new Date();

    const dates = state.lessonDates[lessonId];
    if (dates?.dateStart) {
      return dates.dateStart <= now;
    }

    const vueComp = card?.querySelector('.sport-item')?.__vue__ || card?.__vue__;
    const lessonObj = vueComp?.lesson;
    if (lessonObj) {
      const d = parseLessonDate(lessonObj.date_start);
      if (d) {
        if (!state.lessonDates[lessonId]) state.lessonDates[lessonId] = {};
        state.lessonDates[lessonId].dateStart = d;
        return d <= now;
      }
    }

    const domDate = getDateFromDom(card);
    if (domDate) {
      if (!state.lessonDates[lessonId]) state.lessonDates[lessonId] = {};
      state.lessonDates[lessonId].dateStart = domDate;
      return domDate <= now;
    }

    return false;
  }

  function hasLessonIntersection(lessonId, card) {
    if (card?.querySelector('.red_circle')) return true;
    if (state.lessonIntersections[lessonId] === true) return true;
    const vueComp = card?.querySelector('.sport-item')?.__vue__ || card?.__vue__;
    if (vueComp?.lesson?.intersection) return true;
    return false;
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

    const isMultiBuilding = state.settings.selectedBuildingIds && state.settings.selectedBuildingIds.length > 1;

    cards.forEach(card => {
      const sportItem = card.querySelector('.sport-item');
      if (!sportItem) return;

      totalCount++;
      const lessonId = card.id.replace('section-', '');
      const limitData = getLimitForLesson(lessonId);
      const isPast = isLessonInPast(lessonId, card);
      const hasIntersection = hasLessonIntersection(lessonId, card);

      const hasSpots = (limitData !== null && typeof limitData.available === 'number') ? limitData.available > 0 : true;
      const available = limitData ? Math.max(0, limitData.available) : null;
      const limit = limitData ? Math.max(0, limitData.limit || 0) : null;

      // Тег корпуса при выборе нескольких корпусов
      let bTag = card.querySelector('.itmo-sport-building-tag');
      const buildingName = state.lessonBuildings[lessonId];

      if (isMultiBuilding && buildingName) {
        if (!bTag) {
          bTag = document.createElement('div');
          bTag.className = 'itmo-sport-building-tag';
          const nameSection = sportItem.querySelector('.section-name');
          if (nameSection?.parentElement) {
            nameSection.parentElement.insertAdjacentElement('afterend', bTag);
          } else {
            sportItem.prepend(bTag);
          }
        }
        bTag.innerText = `📍 ${buildingName}`;
      } else if (bTag) {
        bTag.remove();
      }

      // Бейджи мест
      let badge = card.querySelector('.itmo-sport-badge');
      if (state.settings.showBadges) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'itmo-sport-badge';
          sportItem.appendChild(badge);
        }

        if (isPast) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-past';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> Прошло`;
        } else if (available !== null && available > 0) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-available';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> ${available} / ${limit} мест`;
        } else if (available !== null && available <= 0) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-empty';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> 0 / ${limit} мест`;
        } else {
          badge.className = 'itmo-sport-badge itmo-sport-badge-available';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> Места есть`;
        }
      } else if (badge) {
        badge.remove();
      }

      // Фильтрация
      const hideBecauseZeroOrPast = state.settings.hideZeroSpots && (!hasSpots || isPast);
      const hideBecauseIntersection = state.settings.hideIntersections && hasIntersection;
      const shouldHide = hideBecauseZeroOrPast || hideBecauseIntersection;

      if (shouldHide) {
        card.classList.add('itmo-sport-hidden-card');
        hiddenCount++;
      } else {
        card.classList.remove('itmo-sport-hidden-card');
        availableCount++;
      }

      if (isPast && !shouldHide) {
        card.classList.add('itmo-sport-past-card');
      } else {
        card.classList.remove('itmo-sport-past-card');
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
        <label class="switcher itmo-sport-inpage-switcher" title="Скрывать прошедшие занятия и занятия без свободных мест">
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
        <label class="switcher itmo-sport-inpage-switcher" title="Скрывать занятия, пересекающиеся с учебными парами">
          <input type="checkbox" class="switcher-input" id="itmo-sport-toggle-intersections">
          <span class="switcher-indicator">
            <span class="switcher-yes"></span>
            <span class="switcher-no"></span>
          </span>
          <span class="switcher-label">
            Без пересечений
          </span>
        </label>
      `;

      existingSwitcher.parentElement.appendChild(customWrapper);

      const toggleSpots = customWrapper.querySelector('#itmo-sport-inpage-toggle');
      toggleSpots.checked = !!state.settings.hideZeroSpots;
      toggleSpots.addEventListener('change', (e) => {
        state.settings.hideZeroSpots = e.target.checked;
        scheduleUpdateUI(20);
        window.postMessage({
          type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
          setting: 'hideZeroSpots',
          value: e.target.checked
        }, '*');
      });

      const toggleIntersections = customWrapper.querySelector('#itmo-sport-toggle-intersections');
      toggleIntersections.checked = !!state.settings.hideIntersections;
      toggleIntersections.addEventListener('change', (e) => {
        state.settings.hideIntersections = e.target.checked;
        scheduleUpdateUI(20);
        window.postMessage({
          type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
          setting: 'hideIntersections',
          value: e.target.checked
        }, '*');
      });
    } else {
      const toggleSpots = customWrapper.querySelector('#itmo-sport-inpage-toggle');
      if (toggleSpots && toggleSpots.checked !== !!state.settings.hideZeroSpots) {
        toggleSpots.checked = !!state.settings.hideZeroSpots;
      }
      const toggleIntersections = customWrapper.querySelector('#itmo-sport-toggle-intersections');
      if (toggleIntersections && toggleIntersections.checked !== !!state.settings.hideIntersections) {
        toggleIntersections.checked = !!state.settings.hideIntersections;
      }
    }
  }

  function updateBuildingsBar() {
    if (!state.availableBuildings || state.availableBuildings.length === 0) {
      syncFromNuxtStore();
      if (state.availableBuildings.length === 0) return;
    }

    const calendarHeader = document.querySelector('.el-calendar-header-switch') ||
                           document.querySelector('.card.sticky-top') ||
                           document.querySelector('.el-calendar-table');
    if (!calendarHeader) return;

    let bar = document.querySelector('.itmo-sport-buildings-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'itmo-sport-buildings-bar';
      calendarHeader.insertAdjacentElement('beforebegin', bar);
    }

    const selectedIds = new Set((state.settings.selectedBuildingIds || []).map(String));
    const isAllSelected = state.availableBuildings.length > 0 &&
      state.availableBuildings.every(b => selectedIds.has(String(b.id)));

    let chipsHtml = `
      <span class="itmo-sport-buildings-title">Корпуса:</span>
      <button type="button" class="itmo-sport-chip itmo-sport-chip-all ${isAllSelected ? 'active' : ''}" data-id="all">
        Все
      </button>
    `;

    state.availableBuildings.forEach(b => {
      const bId = String(b.id);
      const isSel = selectedIds.has(bId);
      const shortName = getShortBuildingName(b.name);
      chipsHtml += `
        <button type="button" class="itmo-sport-chip ${isSel ? 'active' : ''}" data-id="${bId}" title="${b.name}">
          ${isSel ? '✓ ' : ''}${shortName}
        </button>
      `;
    });

    bar.innerHTML = chipsHtml;

    bar.querySelectorAll('.itmo-sport-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id === 'all') {
          if (isAllSelected) {
            state.settings.selectedBuildingIds = [String(state.availableBuildings[0].id)];
          } else {
            state.settings.selectedBuildingIds = state.availableBuildings.map(b => String(b.id));
          }
        } else {
          let currentList = [...(state.settings.selectedBuildingIds || [])];
          if (currentList.includes(id)) {
            if (currentList.length > 1) {
              currentList = currentList.filter(x => x !== id);
            }
          } else {
            currentList.push(id);
          }
          state.settings.selectedBuildingIds = currentList;
        }

        window.postMessage({
          type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
          setting: 'selectedBuildingIds',
          value: state.settings.selectedBuildingIds
        }, '*');

        updateBuildingsBar();
        if (state.settings.selectedBuildingIds.length > 1) {
          loadMultiBuildingSchedule();
        } else if (state.settings.selectedBuildingIds.length === 1) {
          const store = window.$nuxt?.$store;
          const targetBuilding = state.availableBuildings.find(b => String(b.id) === state.settings.selectedBuildingIds[0]);
          if (store && targetBuilding) {
            store.commit('modules/sport/filters/setBuilding', targetBuilding);
            store.dispatch('modules/sport/sections/loadSectionsSchedule');
          }
        }
      });
    });
  }

  function updateBadgeInSwitcher() {
    const countBadge = document.querySelector('.itmo-sport-inpage-switcher .badge-count');
    if (countBadge) {
      if ((state.settings.hideZeroSpots || state.settings.hideIntersections) && state.stats.hidden > 0) {
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
      stats: state.stats,
      buildings: state.availableBuildings,
      selectedBuildingIds: state.settings.selectedBuildingIds
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ITMO_SPORT_UPDATE_SETTINGS') {
      if (event.data.settings) {
        const prevBuildingIds = JSON.stringify(state.settings.selectedBuildingIds);
        Object.assign(state.settings, event.data.settings);
        const newBuildingIds = JSON.stringify(state.settings.selectedBuildingIds);

        if (prevBuildingIds !== newBuildingIds && state.settings.selectedBuildingIds?.length > 1) {
          loadMultiBuildingSchedule();
        }
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
