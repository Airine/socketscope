// SocketScope Background Service Worker

const tabStates = new Map<number, boolean>();

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bar") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        toggleBar(tab.id);
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    toggleBar(tab.id);
  }
});

function toggleBar(tabId: number) {
  chrome.tabs.sendMessage(tabId, { type: "toggle" }, (response) => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["content-script.js"],
        },
        () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: "toggle" });
          }, 500);
        }
      );
    } else {
      tabStates.set(tabId, response?.visible ?? true);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getConfig") {
    chrome.storage.local.get(
      ["relayUrl", "sessionId", "commandWhitelist", "autoConnect"],
      (result) => {
        sendResponse({
          relayUrl: result.relayUrl || "ws://localhost:3001/ws",
          sessionId: result.sessionId || "",
          commandWhitelist: result.commandWhitelist || ["navigate", "click", "type", "scroll", "capture"],
          autoConnect: result.autoConnect !== false,
        });
      }
    );
    return true;
  }

  if (message.type === "saveConfig") {
    chrome.storage.local.set(message.config, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "getTabStatus") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "getStatus" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ loaded: false });
          } else {
            sendResponse({ loaded: true, ...response });
          }
        });
      } else {
        sendResponse({ loaded: false });
      }
    });
    return true;
  }

  if (message.type === "connectTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "connect" }, (response) => {
          sendResponse(response || { ok: false });
        });
      }
    });
    return true;
  }

  if (message.type === "disconnectTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "disconnect" }, (response) => {
          sendResponse(response || { ok: false });
        });
      }
    });
    return true;
  }

  if (message.type === "generateSessionId") {
    const newId = "sc_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    chrome.storage.local.set({ sessionId: newId }, () => {
      sendResponse({ sessionId: newId });
    });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["relayUrl", "commandWhitelist", "autoConnect"], (result) => {
    if (!result.relayUrl) {
      chrome.storage.local.set({ relayUrl: "ws://localhost:3001/ws" });
    }
    if (!result.commandWhitelist) {
      chrome.storage.local.set({
        commandWhitelist: ["navigate", "click", "type", "scroll", "capture"],
      });
    }
    if (result.autoConnect === undefined) {
      chrome.storage.local.set({ autoConnect: true });
    }
  });
});
