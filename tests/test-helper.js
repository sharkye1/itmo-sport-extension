const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function createMockChrome(initialStorage = {}) {
  const storageData = { ...initialStorage };
  const storageListeners = [];
  const runtimeMessageListeners = [];
  let tabMessageHandlers = [];

  const chromeMock = {
    storage: {
      local: {
        _data: storageData,
        async get(keys) {
          if (keys === null || typeof keys === 'undefined') {
            return { ...storageData };
          }
          if (typeof keys === 'string') {
            return { [keys]: storageData[keys] };
          }
          if (Array.isArray(keys)) {
            const res = {};
            keys.forEach(k => { res[k] = storageData[k]; });
            return res;
          }
          if (typeof keys === 'object') {
            const res = {};
            for (const [k, defVal] of Object.entries(keys)) {
              res[k] = typeof storageData[k] !== 'undefined' ? storageData[k] : defVal;
            }
            return res;
          }
          return { ...storageData };
        },
        async set(items) {
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            const oldValue = storageData[k];
            storageData[k] = v;
            changes[k] = { oldValue, newValue: v };
          }
          storageListeners.forEach(fn => fn(changes, 'local'));
          return true;
        }
      },
      onChanged: {
        addListener(fn) {
          storageListeners.push(fn);
        },
        removeListener(fn) {
          const idx = storageListeners.indexOf(fn);
          if (idx !== -1) storageListeners.splice(idx, 1);
        }
      }
    },
    runtime: {
      id: 'mock-extension-id',
      onMessage: {
        addListener(fn) {
          runtimeMessageListeners.push(fn);
        },
        removeListener(fn) {
          const idx = runtimeMessageListeners.indexOf(fn);
          if (idx !== -1) runtimeMessageListeners.splice(idx, 1);
        }
      },
      async sendMessage(msg) {
        for (const fn of runtimeMessageListeners) {
          const res = await new Promise(resolve => {
            let called = false;
            const sendResponse = (val) => {
              called = true;
              resolve(val);
            };
            const isAsync = fn(msg, {}, sendResponse);
            if (isAsync && typeof isAsync.then === 'function') {
              isAsync.then(val => {
                if (!called) resolve(val);
              }).catch(() => {
                if (!called) resolve(undefined);
              });
            } else if (!isAsync && !called) {
              resolve(undefined);
            }
          });
          if (res !== undefined) return res;
        }
        return undefined;
      }
    },
    tabs: {
      async query(queryInfo) {
        return [{ id: 101, url: 'https://my.itmo.ru/sport/sign' }];
      },
      async sendMessage(tabId, message) {
        const handlers = tabMessageHandlers.length > 0 ? tabMessageHandlers : runtimeMessageListeners;
        for (const handler of handlers) {
          const res = await new Promise(resolve => {
            let called = false;
            const sendResponse = (val) => {
              called = true;
              resolve(val);
            };
            const returned = handler(message, { tab: { id: tabId } }, sendResponse);
            if (returned && typeof returned.then === 'function') {
              returned.then(val => {
                if (!called) resolve(val);
              }).catch(() => {
                if (!called) resolve(undefined);
              });
            } else if (!returned && !called) {
              resolve(undefined);
            }
          });
          if (res !== undefined) return res;
        }
        return undefined;
      }
    },
    _addTabMessageHandler(fn) {
      tabMessageHandlers.push(fn);
    },
    _clearTabMessageHandlers() {
      tabMessageHandlers = [];
    }
  };

  return chromeMock;
}

let activeDOMs = [];

function createDOM(html = '<!DOCTYPE html><html><head></head><body></body></html>', options = {}) {
  const dom = new JSDOM(html, {
    url: 'https://my.itmo.ru/sport/sign',
    runScripts: 'outside-only',
    ...options
  });
  activeDOMs.push(dom);
  return dom;
}

function cleanupDOMs() {
  while (activeDOMs.length > 0) {
    const dom = activeDOMs.pop();
    try {
      dom.window.close();
    } catch (e) {}
  }
}

function loadScript(dom, filePath, context = {}) {
  const absolutePath = path.resolve(__dirname, '..', filePath);
  const code = fs.readFileSync(absolutePath, 'utf8');

  // Provide context variables on window
  for (const [k, v] of Object.entries(context)) {
    dom.window[k] = v;
  }

  dom.window.eval(code);
}

module.exports = {
  createMockChrome,
  createDOM,
  cleanupDOMs,
  loadScript
};
