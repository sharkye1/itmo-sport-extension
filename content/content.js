(() => {
  const DEFAULT_SETTINGS = {
    hideZeroSpots: true,
    hideIntersections: false,
    showBadges: true,
    selectedBuildingIds: []
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let currentStats = { total: 0, available: 0, hidden: 0 };
  let availableBuildings = [];

  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(DEFAULT_SETTINGS);
      currentSettings = { ...DEFAULT_SETTINGS, ...data };
      sendSettingsToBridge(currentSettings);
    } catch (e) {}
  }

  function sendSettingsToBridge(settings) {
    window.postMessage({
      type: 'ITMO_SPORT_UPDATE_SETTINGS',
      settings
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ITMO_SPORT_BRIDGE_SETTING_CHANGED') {
      const { setting, value } = event.data;
      if (setting && typeof value !== 'undefined') {
        currentSettings[setting] = value;
        chrome.storage.local.set({ [setting]: value }).catch(() => {});
      }
    }

    if (event.data.type === 'ITMO_SPORT_BRIDGE_STATS_UPDATE') {
      if (event.data.stats) {
        currentStats = event.data.stats;
      }
      if (event.data.buildings) {
        availableBuildings = event.data.buildings;
      }
      if (event.data.selectedBuildingIds) {
        currentSettings.selectedBuildingIds = event.data.selectedBuildingIds;
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      let changed = false;
      for (const [key, change] of Object.entries(changes)) {
        if (key in currentSettings) {
          currentSettings[key] = change.newValue;
          changed = true;
        }
      }
      if (changed) {
        sendSettingsToBridge(currentSettings);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_EXTENSION_STATE') {
      sendResponse({
        settings: currentSettings,
        stats: currentStats,
        buildings: availableBuildings
      });
      return true;
    }

    if (message.type === 'SET_SETTING') {
      const { setting, value } = message;
      currentSettings[setting] = value;
      chrome.storage.local.set({ [setting]: value }).then(() => {
        sendSettingsToBridge(currentSettings);
        sendResponse({ success: true, settings: currentSettings });
      });
      return true;
    }
  });

  loadSettings();

  setTimeout(() => {
    window.postMessage({ type: 'ITMO_SPORT_REQUEST_STATS' }, '*');
  }, 1000);
})();
