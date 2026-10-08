document.addEventListener('DOMContentLoaded', async () => {
  const toggleHideZero = document.getElementById('toggle-hide-zero');
  const toggleHideIntersections = document.getElementById('toggle-hide-intersections');
  const toggleShowBadges = document.getElementById('toggle-show-badges');
  const statHidden = document.getElementById('stat-hidden');
  const statAvailable = document.getElementById('stat-available');
  const statTotal = document.getElementById('stat-total');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const chipsContainer = document.getElementById('popup-buildings-chips');

  function getShortName(name) {
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

  const stored = await chrome.storage.local.get({
    hideZeroSpots: true,
    hideIntersections: false,
    showBadges: true,
    selectedBuildingIds: []
  });

  let selectedBuildingIds = stored.selectedBuildingIds || [];

  toggleHideZero.checked = stored.hideZeroSpots;
  if (toggleHideIntersections) {
    toggleHideIntersections.checked = !!stored.hideIntersections;
  }
  toggleShowBadges.checked = stored.showBadges;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isItmoTab = activeTab?.url && activeTab.url.includes('my.itmo.ru');

  function renderChips(buildings, selIds) {
    if (!chipsContainer || !Array.isArray(buildings) || buildings.length === 0) return;
    chipsContainer.innerHTML = '';

    const selSet = new Set(selIds.map(String));

    buildings.forEach(b => {
      const bId = String(b.id);
      const isSel = selSet.has(bId);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `popup-chip ${isSel ? 'active' : ''}`;
      chip.innerText = `${isSel ? '✓ ' : ''}${getShortName(b.name)}`;
      chip.title = b.name;

      chip.addEventListener('click', async () => {
        let list = [...selectedBuildingIds];
        if (list.includes(bId)) {
          if (list.length > 1) {
            list = list.filter(x => x !== bId);
          }
        } else {
          list.push(bId);
        }
        selectedBuildingIds = list;
        await updateSetting('selectedBuildingIds', list);
        renderChips(buildings, list);
      });

      chipsContainer.appendChild(chip);
    });
  }

  if (isItmoTab) {
    statusCard.className = 'status-card status-active';
    statusText.innerText = 'Подключено к my.itmo.ru';

    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'GET_EXTENSION_STATE'
      });

      if (response) {
        if (response.settings) {
          toggleHideZero.checked = response.settings.hideZeroSpots;
          if (toggleHideIntersections && typeof response.settings.hideIntersections !== 'undefined') {
            toggleHideIntersections.checked = response.settings.hideIntersections;
          }
          toggleShowBadges.checked = response.settings.showBadges;
          if (Array.isArray(response.settings.selectedBuildingIds)) {
            selectedBuildingIds = response.settings.selectedBuildingIds;
          }
        }
        if (response.stats) {
          statHidden.innerText = String(response.stats.hidden || 0);
          statAvailable.innerText = String(response.stats.available || 0);
          statTotal.innerText = String(response.stats.total || 0);
        }
        if (Array.isArray(response.buildings) && response.buildings.length > 0) {
          renderChips(response.buildings, selectedBuildingIds);
        }
      }
    } catch (e) {
      statusText.innerText = 'Обновите страницу записи';
    }
  } else {
    statusCard.className = 'status-card status-inactive';
    statusText.innerText = 'Откройте my.itmo.ru/sport';
  }

  async function updateSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });

    if (activeTab?.id && isItmoTab) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SET_SETTING',
          setting: key,
          value: value
        });
      } catch (e) {}
    }
  }

  toggleHideZero.addEventListener('change', async (e) => {
    await updateSetting('hideZeroSpots', e.target.checked);
  });

  if (toggleHideIntersections) {
    toggleHideIntersections.addEventListener('change', async (e) => {
      await updateSetting('hideIntersections', e.target.checked);
    });
  }

  toggleShowBadges.addEventListener('change', async (e) => {
    await updateSetting('showBadges', e.target.checked);
  });
});
