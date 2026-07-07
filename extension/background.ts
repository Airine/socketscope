// SocketScope Background Service Worker
// Manages WebSocket connections, session state, keyboard shortcuts, and screen capture

// Keep track of which tabs have the bar visible
const tabStates = new Map<number, boolean>();

// Screen capture state
let captureInterval: ReturnType<typeof setInterval> | null = null;
let captureWs: WebSocket | null = null;
let captureTabId: number | null = null;
const CAPTURE_FPS = 5; // frames per second
const CAPTURE_QUALITY = 80; // JPEG quality 0-100

// Listen for keyboard shortcut
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

// Listen for extension icon click
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

// Screen capture: take screenshot of current tab and send via WebSocket
async function captureFrame() {
  if (!captureWs || captureWs.readyState !== WebSocket.OPEN) return;

  try {
    const tabId = captureTabId;
    if (!tabId) return;

    const dataUrl = await chrome.tabs.captureVisibleTab(
      chrome.windows.WINDOW_ID_CURRENT,
      {
        format: "jpeg",
        quality: CAPTURE_QUALITY,
      }
    );

    // Send frame via WebSocket (base64 JPEG)
    captureWs.send(
      JSON.stringify({
        type: "capture_frame",
        payload: { image: dataUrl, timestamp: Date.now() },
      })
    );
  } catch (err) {
    console.error("Capture failed:", (err as Error).message);
  }
}

function startCapture(ws: WebSocket, tabId: number) {
  stopCapture();
  captureWs = ws;
  captureTabId = tabId;
  captureFrame(); // first frame immediately
  captureInterval = setInterval(captureFrame, 1000 / CAPTURE_FPS);
}

function stopCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  captureWs = null;
  captureTabId = null;
}

// Handle messages from popup/content script
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

  // Screen capture control from content script
  if (message.type === "startCapture") {
    const wsUrl = message.wsUrl as string;
    const tabId = sender.tab?.id;
    const sessionId = message.sessionId as string;
    if (wsUrl && tabId && sessionId) {
      const ws = new WebSocket(`${wsUrl}?sessionId=${sessionId}&role=controller`);
      ws.onopen = () => {
        startCapture(ws, tabId);
        sendResponse({ ok: true });
      };
      ws.onerror = () => sendResponse({ ok: false, error: "WS connect failed" });
      return true;
    }
    sendResponse({ ok: false, error: "Missing params" });
    return true;
  }

  if (message.type === "stopCapture") {
    stopCapture();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// Install handler
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
