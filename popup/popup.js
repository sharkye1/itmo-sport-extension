document.addEventListener('DOMContentLoaded', async () => {
  const toggleHideZero = document.getElementById('toggle-hide-zero');
  const toggleHideIntersections = document.getElementById('toggle-hide-intersections');
  const toggleShowBadges = document.getElementById('toggle-show-badges');
  const statHidden = document.getElementById('stat-hidden');
  const statAvailable = document.getElementById('stat-available');
  const statTotal = document.getElementById('stat-total');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');

  const stored = await chrome.storage.local.get({
    hideZeroSpots: true,
    hideIntersections: false,
    showBadges: true
  });

  toggleHideZero.checked = stored.hideZeroSpots;
  if (toggleHideIntersections) {
    toggleHideIntersections.checked = !!stored.hideIntersections;
  }
  toggleShowBadges.checked = stored.showBadges;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isItmoTab = activeTab?.url && activeTab.url.includes('my.itmo.ru');

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
        }
        if (response.stats) {
          statHidden.innerText = String(response.stats.hidden || 0);
          statAvailable.innerText = String(response.stats.available || 0);
          statTotal.innerText = String(response.stats.total || 0);
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
