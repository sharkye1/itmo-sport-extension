(() => {
  const DEFAULT_SETTINGS = {
    hideZeroSpots: true,
    showBadges: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let currentStats = { total: 0, available: 0, hidden: 0 };

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
        stats: currentStats
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
