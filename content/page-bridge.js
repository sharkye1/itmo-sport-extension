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
      compactMode: true,
      showBadges: true,
      selectedBuildingIds: []
    },
    availableBuildings: [],
    lessonBuildings: {},
    limits: {},
    lessonGroupMap: {},
    lessonDates: {},
    lessonIntersections: {},
    lastScheduleDates: null,
    stats: {
      total: 0,
      available: 0,
      hidden: 0
    }
  };

  function applyCompactMode(enabled) {
    const root = document.documentElement || document.querySelector('html');
    if (root) {
      if (enabled) {
        root.setAttribute('data-itmo-compact', 'true');
      } else {
        root.removeAttribute('data-itmo-compact');
      }
    }
    try {
      updateTimeCells(enabled);
    } catch (e) {}
    try {
      updateCards();
    } catch (e) {}
  }

  applyCompactMode(state.settings.compactMode);

  let updateTimer = null;
  let isStoreSubscribed = false;
  let isInternalScheduleUpdate = false;
  let isLoadingMultiSchedule = false;

  function updateTimeCells(enabled = state.settings.compactMode) {
    const timeCells = document.querySelectorAll('.time-cell');
    timeCells.forEach(cell => {
      if (!enabled) {
        if (cell.hasAttribute('data-original-html')) {
          cell.innerHTML = cell.getAttribute('data-original-html');
          cell.removeAttribute('data-original-html');
        }
        return;
      }

      const startEl = cell.querySelector('.time-start');
      const endEl = cell.querySelector('.time-end');
      if (startEl && endEl) {
        Array.from(cell.childNodes).forEach(node => {
          if (node !== startEl && node !== endEl) {
            if (node.nodeType === 3 && node.textContent.trim()) {
              node.textContent = '';
            } else if (node.nodeType === 1 && !node.classList.contains('time-start') && !node.classList.contains('time-end')) {
              node.style.display = 'none';
            }
          }
        });
      } else {
        const text = cell.textContent.trim();
        const m = text.match(/(\d{1,2}:\d{2})\s*[-–—/]?\s*(\d{1,2}:\d{2})/);
        if (m) {
          if (!cell.hasAttribute('data-original-html')) {
            cell.setAttribute('data-original-html', cell.innerHTML);
          }
          cell.innerHTML = `<div class="time-start">${m[1]}</div><div class="time-end">${m[2]}</div>`;
        }
      }
    });
  }

  function scheduleUpdateUI(delay = 50) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      try {
        applyCompactMode(state.settings.compactMode);
      } catch (e) {}
      try {
        updateTimeCells();
      } catch (e) {}
      try {
        syncFromNuxtStore();
      } catch (e) {}
      try {
        updateInPageSwitcher();
      } catch (e) {}
      try {
        updateBuildingsBar();
      } catch (e) {}
      try {
        updateCards();
      } catch (e) {}
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

  function extractBuildings(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
      if (data.some(b => b && typeof b.name === 'string')) return data;
    }
    if (Array.isArray(data?.result?.buildings)) return data.result.buildings;
    if (Array.isArray(data?.buildings)) return data.buildings;
    if (Array.isArray(data?.result)) {
      if (data.result.some(b => b && typeof b.name === 'string')) return data.result;
    }
    return null;
  }

  let isFetchingFilters = false;
  async function fetchFiltersDirectly() {
    if (isFetchingFilters || (state.availableBuildings && state.availableBuildings.length > 0)) return;
    isFetchingFilters = true;
    try {
      const res = await fetch('/api/sport/sign/schedule/filters');
      const json = await res.json();
      const b = extractBuildings(json);
      if (Array.isArray(b) && b.length > 0) {
        state.availableBuildings = b;
        syncSelectedBuildings();
        scheduleUpdateUI(30);
      }
    } catch (e) {
    } finally {
      isFetchingFilters = false;
    }
  }

  function parseFiltersResponse(data) {
    try {
      const b = extractBuildings(data);
      if (Array.isArray(b) && b.length > 0) {
        state.availableBuildings = b;
        syncSelectedBuildings();
        updateBuildingsBar();
      }
    } catch (e) {}
  }

  function extractBuildingFromUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      const bId = u.searchParams.get('building_id');
      if (bId) {
        if (!state.availableBuildings || state.availableBuildings.length === 0) {
          const b = findBuildingsInStore() || findBuildingsInDom();
          if (Array.isArray(b) && b.length > 0) {
            state.availableBuildings = b;
          }
        }
        if (state.availableBuildings && state.availableBuildings.length > 0) {
          const bObj = state.availableBuildings.find(b => String(b.id) === String(bId));
          return getShortBuildingName(bObj?.name);
        }
      }
    } catch (e) {}
    return null;
  }

  function parseScheduleResponse(data, sourceUrl = '') {
    if (!data?.result || !Array.isArray(data.result)) return;
    const buildingShort = sourceUrl ? extractBuildingFromUrl(sourceUrl) : null;
    data.result.forEach(day => {
      const dayDate = day?.date ? String(day.date).split('T')[0].split(' ')[0] : null;
      if (Array.isArray(day?.lessons)) {
        day.lessons.forEach(lesson => {
          if (!lesson?.id) return;
          const lessonId = String(lesson.id);
          if (buildingShort) {
            state.lessonBuildings[lessonId] = buildingShort;
          }
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

  function extractDatesFromUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      const ds = u.searchParams.get('date_start');
      const de = u.searchParams.get('date_end');
      if (ds && de) {
        state.lastScheduleDates = { date_start: ds, date_end: de };
      }
    } catch (e) {}
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
        if (this._itmoUrl.includes('_is_ext=1')) return;
        if (this._itmoUrl.includes('/api/sport/sign/schedule/limits')) {
          parseLimitsResponse(JSON.parse(this.responseText));
          scheduleUpdateUI(30);
        } else if (this._itmoUrl.includes('filters')) {
          parseFiltersResponse(JSON.parse(this.responseText));
        } else if (this._itmoUrl.includes('/api/sport/sign/schedule')) {
          extractDatesFromUrl(this._itmoUrl);
          parseScheduleResponse(JSON.parse(this.responseText), this._itmoUrl);
          scheduleUpdateUI(30);
          if (!isLoadingMultiSchedule && state.settings.selectedBuildingIds?.length > 1) {
            loadMultiBuildingSchedule();
          }
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function(...args) {
      const res = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (url.includes('_is_ext=1')) return res;
        if (url.includes('/api/sport/sign/schedule/limits')) {
          res.clone().json().then(data => {
            parseLimitsResponse(data);
            scheduleUpdateUI(30);
          }).catch(() => {});
        } else if (url.includes('filters')) {
          res.clone().json().then(data => {
            parseFiltersResponse(data);
          }).catch(() => {});
        } else if (url.includes('/api/sport/sign/schedule')) {
          extractDatesFromUrl(url);
          res.clone().json().then(data => {
            parseScheduleResponse(data, url);
            scheduleUpdateUI(30);
            if (!isLoadingMultiSchedule && state.settings.selectedBuildingIds?.length > 1) {
              loadMultiBuildingSchedule();
            }
          }).catch(() => {});
        }
      } catch (e) {}
      return res;
    };
  }

  function findBuildingsInStore() {
    try {
      const store = window.$nuxt?.$store;
      if (!store) return null;
      const sport = store.state?.['modules/sport'] || store.state?.sport;
      if (sport) {
        const list = extractBuildings(sport.filters?.filters?.buildings) ||
                     extractBuildings(sport.filters?.availableFilters?.buildings) ||
                     extractBuildings(sport.filters?.buildings) ||
                     extractBuildings(sport.scheduleFilters?.buildings) ||
                     extractBuildings(sport.buildings);
        if (list) return list;
      }
      const getters = store.getters;
      if (getters) {
        for (const key of Object.keys(getters)) {
          if (key.includes('building') || key.includes('Building') || key.includes('filters')) {
            const list = extractBuildings(getters[key]);
            if (list) return list;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function findBuildingsInDom() {
    try {
      const multiselects = document.querySelectorAll('.multiselect');
      for (const ms of multiselects) {
        const options = ms.__vue__?.options;
        if (Array.isArray(options) && options.length > 0) {
          if (options.some(o => o && typeof o.name === 'string' && (o.name.includes('Ломонос') || o.name.includes('Вязем') || o.name.includes('Кронверк')))) {
            return options;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function syncSelectedBuildings() {
    const store = window.$nuxt?.$store;
    const currentBuilding = store?.state?.['modules/sport']?.filters?.currentFilters?.building;
    const currentId = currentBuilding?.id ? String(currentBuilding.id) : null;

    if (!state.settings.selectedBuildingIds || state.settings.selectedBuildingIds.length === 0) {
      if (currentId) {
        state.settings.selectedBuildingIds = [currentId];
      } else if (state.availableBuildings.length > 0) {
        state.settings.selectedBuildingIds = [String(state.availableBuildings[0].id)];
      }
    }
  }

  function syncFromNuxtStore() {
    try {
      const store = window.$nuxt?.$store;
      if (!store) return;

      if (!state.availableBuildings || state.availableBuildings.length === 0) {
        const b = findBuildingsInStore() || findBuildingsInDom();
        if (Array.isArray(b) && b.length > 0) {
          state.availableBuildings = b;
          syncSelectedBuildings();
          updateBuildingsBar();
        }
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

  function getCurrentWeekDates() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { date_start: fmt(monday), date_end: fmt(sunday) };
  }

  async function loadMultiBuildingSchedule(customDates = null) {
    if (isLoadingMultiSchedule) return;
    const buildingIds = state.settings.selectedBuildingIds;
    if (!buildingIds || buildingIds.length <= 1) return;

    if (!state.availableBuildings || state.availableBuildings.length === 0) {
      const b = findBuildingsInStore() || findBuildingsInDom();
      if (Array.isArray(b) && b.length > 0) {
        state.availableBuildings = b;
      }
    }

    const store = window.$nuxt?.$store;
    if (!store) return;

    const dates = customDates || state.lastScheduleDates || store.state?.['modules/sport']?.sections?.dates || getCurrentWeekDates();
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
        params.append('_is_ext', '1');

        const fetchFn = (typeof window !== 'undefined' && window.fetch) || fetch;
        const res = await fetchFn(`/api/sport/sign/schedule?${params.toString()}`);
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

  function cleanTitlePrefix(str) {
    return str.replace(/^(?:ст\.?\s*преп(?:\.|одаватель)?|преп(?:\.|одаватель)?|доц(?:\.|ент)?|проф(?:\.|ессор)?|асс(?:\.|истент)?|тренер|д\.?\s*п\.?\s*н\.?|к\.?\s*п\.?\s*н\.?)\s+/i, '').trim();
  }

  function isPatronymic(w) {
    return /(?:овна|евна|ична|инична|ович|евич|ич)$/i.test(w);
  }

  function formatInitial(w) {
    if (w.includes('-')) {
      return w.split('-').filter(Boolean).map(p => p[0].toUpperCase() + '.').join('-');
    }
    return w[0].toUpperCase() + '.';
  }

  function formatSingleTeacher(name) {
    if (!name || typeof name !== 'string') return '';
    let str = cleanTitlePrefix(name.trim().replace(/\s+/g, ' '));
    if (!str) return '';

    // Check if starts with initials: 'В. А. Платонова' or 'В.А. Платонова' or 'В. Платонова'
    const prefixInitialsMatch = str.match(/^([A-Za-zА-Яа-яЁё])\.?\s*([A-Za-zА-Яа-яЁё])?\.?\s+([A-Za-zА-Яа-яЁё-]+)$/);
    if (prefixInitialsMatch) {
      const [, i1, i2, surname] = prefixInitialsMatch;
      if (surname.length > 1) {
        if (i2) {
          return `${surname} ${i1.toUpperCase()}. ${i2.toUpperCase()}.`;
        }
        return `${surname} ${i1.toUpperCase()}.`;
      }
    }

    // Check if ends with initials: 'Платонова В. А.' or 'Платонова В.А.' or 'Платонова В.'
    const suffixInitialsMatch = str.match(/^([A-Za-zА-Яа-яЁё-]+)\s+([A-Za-zА-Яа-яЁё])\.?\s*([A-Za-zА-Яа-яЁё])?\.?$/);
    if (suffixInitialsMatch) {
      const [, surname, i1, i2] = suffixInitialsMatch;
      if (surname.length > 1) {
        if (i2) {
          return `${surname} ${i1.toUpperCase()}. ${i2.toUpperCase()}.`;
        }
        return `${surname} ${i1.toUpperCase()}.`;
      }
    }

    const parts = str.split(' ');
    if (parts.length === 1) {
      return parts[0];
    }

    // If 3 parts: check if part 2 is patronymic -> e.g. 'Валентина Александровна Платонова'
    if (parts.length === 3 && isPatronymic(parts[1])) {
      const firstName = parts[0];
      const patronymic = parts[1];
      const surname = parts[2];
      return `${surname} ${formatInitial(firstName)} ${formatInitial(patronymic)}`;
    }

    // Standard: Surname First Name Patronymic: 'Платонова Валентина Александровна'
    const surname = parts[0];
    const initials = parts.slice(1).map(p => formatInitial(p));
    return `${surname} ${initials.join(' ')}`;
  }

  function formatTeacherInitials(fullText) {
    if (!fullText || typeof fullText !== 'string') return '';
    if (fullText.includes(',')) {
      return fullText.split(',').map(s => formatSingleTeacher(s)).join(', ');
    }
    if (fullText.includes(';')) {
      return fullText.split(';').map(s => formatSingleTeacher(s)).join('; ');
    }
    if (fullText.includes('/')) {
      return fullText.split('/').map(s => formatSingleTeacher(s)).join(' / ');
    }
    return formatSingleTeacher(fullText);
  }

  function findTeacherElement(sportItem) {
    let el = sportItem.querySelector('.teacher, .teacher-name, .itmo-sport-teacher');
    if (el) return el;

    const candidates = sportItem.querySelectorAll('p, span, div');
    for (const cand of candidates) {
      if (cand.classList.contains('section-name') ||
          cand.classList.contains('itmo-sport-badge') ||
          cand.classList.contains('itmo-sport-building-tag') ||
          cand.classList.contains('itmo-sport-title-row') ||
          cand.classList.contains('itmo-sport-meta-row') ||
          cand.classList.contains('itmo-sport-badge-icon') ||
          cand.classList.contains('red_circle') ||
          cand.closest('.itmo-sport-badge') ||
          cand.closest('.itmo-sport-building-tag') ||
          cand.closest('.itmo-sport-title-row')) {
        continue;
      }
      const text = cand.textContent.trim();
      if (text && /^[А-Яа-яA-Za-zёЁ\s.,-]+$/.test(text) && text.length > 2) {
        return cand;
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

      // 1. Строка 1: Контейнер заголовка и бейджа мест (.itmo-sport-title-row)
      const nameSection = sportItem.querySelector('.section-name');
      let titleRow = sportItem.querySelector('.itmo-sport-title-row');
      if (!titleRow && nameSection) {
        titleRow = document.createElement('div');
        titleRow.className = 'itmo-sport-title-row';
        nameSection.parentElement.insertBefore(titleRow, nameSection);
        titleRow.appendChild(nameSection);
      }

      if (titleRow && nameSection && nameSection.parentElement !== titleRow) {
        titleRow.insertBefore(nameSection, titleRow.firstChild);
      }

      // Индикатор пересечения пар (.red_circle) в первой строке рядом с названием
      const redCircle = sportItem.querySelector('.red_circle');
      if (redCircle && titleRow && redCircle.parentElement !== titleRow) {
        if (nameSection && nameSection.nextSibling) {
          titleRow.insertBefore(redCircle, nameSection.nextSibling);
        } else {
          titleRow.appendChild(redCircle);
        }
      }

      // 2. Преподаватель: сокращение ФИО до фамилии и инициалов в компактном режиме
      const teacherEl = findTeacherElement(sportItem);
      if (teacherEl) {
        teacherEl.classList.add('itmo-sport-teacher');
        if (state.settings.compactMode) {
          if (!teacherEl.hasAttribute('data-original-name')) {
            teacherEl.setAttribute('data-original-name', teacherEl.textContent.trim());
          }
          const original = teacherEl.getAttribute('data-original-name');
          if (original) {
            teacherEl.setAttribute('title', original);
            teacherEl.textContent = formatTeacherInitials(original);
          }
        } else if (teacherEl.hasAttribute('data-original-name')) {
          teacherEl.textContent = teacherEl.getAttribute('data-original-name');
          teacherEl.removeAttribute('data-original-name');
        }
      }

      // 3. Строка 2: Мета-информация (.itmo-sport-meta-row: Преподаватель + Корпус)
      const buildingName = state.lessonBuildings[lessonId];
      let metaRow = sportItem.querySelector('.itmo-sport-meta-row');
      if (!metaRow && (teacherEl || (isMultiBuilding && buildingName))) {
        metaRow = document.createElement('div');
        metaRow.className = 'itmo-sport-meta-row';
        sportItem.appendChild(metaRow);
      }

      if (metaRow && teacherEl && teacherEl.parentElement !== metaRow) {
        metaRow.insertBefore(teacherEl, metaRow.firstChild);
      }

      // 4. Тег корпуса (Building Tag)
      let bTag = card.querySelector('.itmo-sport-building-tag');
      if (isMultiBuilding && buildingName) {
        if (!bTag) {
          bTag = document.createElement('div');
          bTag.className = 'itmo-sport-building-tag';
        }
        if (metaRow) {
          if (bTag.parentElement !== metaRow) {
            metaRow.appendChild(bTag);
          }
        } else if (titleRow) {
          titleRow.insertAdjacentElement('afterend', bTag);
        } else {
          sportItem.prepend(bTag);
        }
        bTag.textContent = `📍 ${buildingName}`;
      } else if (bTag) {
        bTag.remove();
      }

      if (metaRow && metaRow.children.length === 0) {
        metaRow.remove();
      }

      // 5. Бейджи мест
      let badge = card.querySelector('.itmo-sport-badge');
      if (state.settings.showBadges) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'itmo-sport-badge';
        }
        if (titleRow) {
          if (badge.parentElement !== titleRow) {
            titleRow.appendChild(badge);
          }
        } else if (badge.parentElement !== sportItem) {
          sportItem.appendChild(badge);
        }

        if (isPast) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-past';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> Прошло`;
          badge.title = 'Занятие уже прошло';
        } else if (available !== null && available > 0) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-available';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> <span class="badge-count-text">${available} / ${limit}</span><span class="badge-unit"> мест</span>`;
          badge.title = `${available} из ${limit} мест доступно`;
        } else if (available !== null && available <= 0) {
          badge.className = 'itmo-sport-badge itmo-sport-badge-empty';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> <span class="badge-count-text">0 / ${limit}</span><span class="badge-unit"> мест</span>`;
          badge.title = `0 из ${limit} мест (запись заполнена)`;
        } else {
          badge.className = 'itmo-sport-badge itmo-sport-badge-available';
          badge.innerHTML = `<span class="itmo-sport-badge-icon"></span> Места есть`;
          badge.title = 'Свободные места есть';
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
    const existingSwitcher = document.querySelector('.switcher:not(.itmo-sport-inpage-switcher)');
    if (!existingSwitcher?.parentElement) return;

    let customWrapper = existingSwitcher.parentElement.querySelector('.itmo-sport-switch-wrapper') ||
                         document.querySelector('.itmo-sport-switch-wrapper');
    if (!customWrapper || !existingSwitcher.parentElement.contains(customWrapper) || !customWrapper.querySelector('#itmo-sport-toggle-compact')) {
      if (customWrapper) customWrapper.remove();
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
        <label class="switcher itmo-sport-inpage-switcher" title="Компактный вид расписания (уменьшает высоту ячеек и карточек)">
          <input type="checkbox" class="switcher-input" id="itmo-sport-toggle-compact">
          <span class="switcher-indicator">
            <span class="switcher-yes"></span>
            <span class="switcher-no"></span>
          </span>
          <span class="switcher-label">
            Компактно
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

      const toggleCompact = customWrapper.querySelector('#itmo-sport-toggle-compact');
      toggleCompact.checked = !!state.settings.compactMode;
      toggleCompact.addEventListener('change', (e) => {
        state.settings.compactMode = e.target.checked;
        applyCompactMode(e.target.checked);
        scheduleUpdateUI(20);
        window.postMessage({
          type: 'ITMO_SPORT_BRIDGE_SETTING_CHANGED',
          setting: 'compactMode',
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
      const toggleCompact = customWrapper.querySelector('#itmo-sport-toggle-compact');
      if (toggleCompact && toggleCompact.checked !== !!state.settings.compactMode) {
        toggleCompact.checked = !!state.settings.compactMode;
      }
    }
  }

  function updateBuildingsBar() {
    try {
      if (!state.availableBuildings || state.availableBuildings.length === 0) {
        const fromStore = findBuildingsInStore();
        if (fromStore) state.availableBuildings = fromStore;
        else {
          const fromDom = findBuildingsInDom();
          if (fromDom) state.availableBuildings = fromDom;
        }
      }

      if (!state.availableBuildings || state.availableBuildings.length === 0) {
        fetchFiltersDirectly();
        return;
      }

      syncSelectedBuildings();

      const weekSwitch = document.querySelector('.el-calendar-header-switch');
      const calendarCard = document.querySelector('.card.sticky-top') ||
                           document.querySelector('.card-body') ||
                           document.querySelector('.el-calendar-table');
      if (!weekSwitch && !calendarCard) return;

      let bar = document.querySelector('.itmo-sport-buildings-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'itmo-sport-buildings-bar';
        if (weekSwitch && weekSwitch.parentElement) {
          weekSwitch.parentElement.insertBefore(bar, weekSwitch);
        } else if (calendarCard && calendarCard.parentElement) {
          calendarCard.parentElement.insertBefore(bar, calendarCard);
        }
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
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
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
    } catch (e) {}
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
        applyCompactMode(state.settings.compactMode);
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
      applyCompactMode(state.settings.compactMode);
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleUpdateUI(100);
    });
  }

  // Запуск прямого получения фильтров с сервера
  fetchFiltersDirectly();

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
