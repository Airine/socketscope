// SocketScope Content Script
// Injects a floating control bar and handles remote command execution

interface SocketScopeConfig {
  relayUrl: string;
  sessionId: string;
  commandWhitelist: string[];
  autoConnect: boolean;
}

interface WSMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

let ws: WebSocket | null = null;
let config: SocketScopeConfig | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let isExpanded = false;
let peerCount = 0;
let latency = 0;
let isConnected = false;
let commandLog: Array<{ time: string; text: string; status: "ok" | "error" }> = [];
let shadowRoot: ShadowRoot | null = null;
let barContainer: HTMLDivElement | null = null;

const DEFAULT_COMMANDS = ["navigate", "click", "type", "scroll", "capture"];

// ─── DOM Mirror Engine ───
// MutationObserver-based DOM synchronization
let domMirrorObserver: MutationObserver | null = null;
let domMirrorTimer: ReturnType<typeof setTimeout> | null = null;
let domMirrorScrollTimer: ReturnType<typeof setInterval> | null = null;
let domMirrorActive = false;
let pendingMutations: MutationRecord[] = [];
let nextNodeId = 10000;
const nodeToId = new WeakMap<Node, number>();
const idToNodeMap = new Map<number, Node>();

function ensureNodeId(node: Node): number {
  let id = nodeToId.get(node);
  if (!id) {
    id = nextNodeId++;
    nodeToId.set(node, id);
    idToNodeMap.set(id, node);
  }
  return id;
}

function getNodeId(node: Node | null): number | null {
  if (!node) return null;
  return nodeToId.get(node) || null;
}

function serializeNode(node: Node, depth = 0): any {
  if (depth > 20) return { type: "max-depth" };
  const base: any = { id: ensureNodeId(node), nodeType: node.nodeType };
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    base.tagName = el.tagName.toLowerCase();
    if (el.attributes && el.attributes.length > 0) {
      base.attrs = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr.name.startsWith("on")) continue;
        if (attr.name === "srcdoc") continue;
        base.attrs[attr.name] = attr.value;
      }
    }
    if (el.childNodes.length > 0 && depth < 3) {
      base.children = Array.from(el.childNodes).map((c) => serializeNode(c, depth + 1));
    }
  } else if (node.nodeType === Node.TEXT_NODE) {
    const text = (node as Text).textContent || "";
    base.textContent = text.length > 5000 ? text.slice(0, 5000) + "..." : text;
  } else if (node.nodeType === Node.COMMENT_NODE) {
    base.textContent = (node as Comment).textContent || "";
  }
  return base;
}

function serializeMutation(record: MutationRecord): any {
  const result: any = { type: record.type, targetId: ensureNodeId(record.target) };
  if (record.type === "childList") {
    if (record.addedNodes.length > 0) {
      result.addedNodes = Array.from(record.addedNodes).map((n) => serializeNode(n));
    }
    if (record.removedNodes.length > 0) {
      result.removedNodes = Array.from(record.removedNodes).map((n) => getNodeId(n)).filter(Boolean);
    }
    const nextId = getNodeId(record.nextSibling);
    if (nextId) result.nextSiblingId = nextId;
    const prevId = getNodeId(record.previousSibling);
    if (prevId) result.previousSiblingId = prevId;
  } else if (record.type === "attributes") {
    result.attributeName = record.attributeName;
    result.newValue = (record.target as Element).getAttribute(record.attributeName || "");
  } else if (record.type === "characterData") {
    result.newValue = (record.target as CharacterData).textContent;
  }
  return result;
}

function collectStyles(): string[] {
  const styles: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const sheet = document.styleSheets[i];
      const rules = sheet.cssRules || sheet.rules;
      if (rules) {
        let css = "";
        for (let j = 0; j < rules.length; j++) css += rules[j].cssText + "\n";
        if (css) styles.push(css);
      }
    } catch {
      try { const sheet = document.styleSheets[i]; if (sheet.href) styles.push(`/* @import url("${sheet.href}"); */`); } catch { /* ignore */ }
    }
  }
  document.querySelectorAll("style").forEach((el) => { if (el.textContent) styles.push(el.textContent); });
  return styles;
}

function tagExistingNodes(node: Node) {
  ensureNodeId(node);
  node.childNodes.forEach((child) => tagExistingNodes(child));
}

function flushMutations() {
  domMirrorTimer = null;
  if (pendingMutations.length === 0) return;
  const records = pendingMutations;
  pendingMutations = [];
  const mutations = records.map(serializeMutation).filter(Boolean);
  if (mutations.length === 0) return;
  send({ type: "mutations", payload: { mutations } });
}

function startDOMMirror() {
  if (domMirrorActive) return;
  domMirrorActive = true;
  nextNodeId = 10000;
  tagExistingNodes(document.documentElement);

  // Send initial snapshot
  send({
    type: "snapshot",
    payload: {
      root: serializeNode(document.documentElement, 0),
      styles: collectStyles(),
      title: document.title,
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
  });

  domMirrorObserver = new MutationObserver((records) => {
    pendingMutations.push(...records);
    if (!domMirrorTimer) domMirrorTimer = setTimeout(flushMutations, 50);
  });

  domMirrorObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeOldValue: true, characterData: true, characterDataOldValue: true,
  });

  let lastScrollX = 0, lastScrollY = 0;
  domMirrorScrollTimer = setInterval(() => {
    if (window.scrollX !== lastScrollX || window.scrollY !== lastScrollY) {
      lastScrollX = window.scrollX; lastScrollY = window.scrollY;
      send({ type: "scroll", payload: { x: lastScrollX, y: lastScrollY } });
    }
  }, 100);
}

function stopDOMMirror() {
  domMirrorActive = false;
  if (domMirrorObserver) { domMirrorObserver.disconnect(); domMirrorObserver = null; }
  if (domMirrorTimer) { clearTimeout(domMirrorTimer); domMirrorTimer = null; }
  if (domMirrorScrollTimer) { clearInterval(domMirrorScrollTimer); domMirrorScrollTimer = null; }
  pendingMutations = [];
}

// Generate session ID
function generateSessionId(): string {
  return "sc_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// Get config from storage
async function loadConfig(): Promise<SocketScopeConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["relayUrl", "sessionId", "commandWhitelist", "autoConnect"],
      (result) => {
        resolve({
          relayUrl: result.relayUrl || "ws://localhost:3001/ws",
          sessionId: result.sessionId || generateSessionId(),
          commandWhitelist: result.commandWhitelist || DEFAULT_COMMANDS,
          autoConnect: result.autoConnect !== false,
        });
      }
    );
  });
}

// Save session ID
async function saveSessionId(id: string) {
  await chrome.storage.local.set({ sessionId: id });
}

// Connect to WebSocket relay
async function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  config = await loadConfig();
  await saveSessionId(config.sessionId);

  const url = `${config.relayUrl}?sessionId=${config.sessionId}&role=controller`;

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected = true;
      updateUI();
      startHeartbeat();
      showToast("Connected to relay server");

      // Send page info
      send({
        type: "page_info",
        payload: {
          title: document.title,
          url: window.location.href,
        },
      });

      // Start screen capture stream
      startCaptureStream();

      // Start DOM Mirror
      startDOMMirror();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        handleMessage(msg);
      } catch {
        // ignore invalid messages
      }
    };

    ws.onclose = () => {
      isConnected = false;
      peerCount = 0;
      updateUI();
      stopHeartbeat();

      // Auto-reconnect
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => {
      isConnected = false;
      updateUI();
    };
  } catch {
    isConnected = false;
    updateUI();
  }
}

function disconnect() {
  stopHeartbeat();
  stopCaptureStream();
  stopDOMMirror();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
  isConnected = false;
  peerCount = 0;
  updateUI();
}

function send(msg: WSMessage) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    const start = Date.now();
    send({ type: "heartbeat" });

    // One-time pong listener for RTT
    const onPong = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === "pong") {
          latency = Date.now() - start;
          send({ type: "rtt", payload: { rtt: latency } });
          updateUI();
          ws?.removeEventListener("message", onPong);
        }
      } catch {
        // ignore
      }
    };
    ws?.addEventListener("message", onPong);
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function handleMessage(msg: WSMessage) {
  switch (msg.type) {
    case "peer_joined":
      peerCount = (msg.payload?.peerCount as number) || peerCount + 1;
      updateUI();
      showToast(`Peer joined (${peerCount} connected)`);
      break;

    case "peer_left":
      peerCount = (msg.payload?.peerCount as number) || Math.max(0, peerCount - 1);
      updateUI();
      break;

    case "execute_command": {
      const cmdId = msg.payload?.cmdId as string;
      const commandType = msg.payload?.commandType as string;
      const payload = msg.payload?.payload as Record<string, unknown>;
      const peerId = msg.payload?.peerId as string;
      executeCommand(cmdId, commandType, payload, peerId);
      break;
    }
  }
}

async function executeCommand(
  cmdId: string,
  commandType: string,
  payload: Record<string, unknown> = {},
  peerId: string
) {
  const whitelist = config?.commandWhitelist || DEFAULT_COMMANDS;
  if (!whitelist.includes(commandType)) {
    send({
      type: "command_result",
      payload: { cmdId, result: "error", error: `Command "${commandType}" not whitelisted`, peerId },
    });
    return;
  }

  const startTime = Date.now();
  let result = "success";
  let error = "";

  try {
    switch (commandType) {
      case "navigate": {
        const url = payload.url as string;
        if (url) window.location.href = url;
        break;
      }

      case "click": {
        const selector = payload.selector as string;
        const x = payload.x as number;
        const y = payload.y as number;

        let el: Element | null = null;
        let clickX = 0;
        let clickY = 0;

        if (selector) {
          el = document.querySelector(selector);
        } else if (typeof x === "number" && typeof y === "number") {
          // Support both pixel coordinates and normalized (0-1) coordinates
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            // Normalized coordinates: convert to pixel
            clickX = Math.round(x * window.innerWidth);
            clickY = Math.round(y * window.innerHeight);
          } else {
            // Pixel coordinates
            clickX = x;
            clickY = y;
          }
          el = document.elementFromPoint(clickX, clickY);
        }

        if (el) {
          flashElementAt(clickX || (el as HTMLElement).offsetLeft, clickY || (el as HTMLElement).offsetTop);
          (el as HTMLElement).click();
        } else if (clickX > 0 || clickY > 0) {
          // Fallback: dispatch click event at coordinates even if no element found
          const target = document.elementFromPoint(clickX, clickY);
          if (target) {
            flashElementAt(clickX, clickY);
            (target as HTMLElement).click();
          } else {
            throw new Error(`No element at coordinates (${clickX}, ${clickY})`);
          }
        } else {
          throw new Error("Element not found");
        }
        break;
      }

      case "type": {
        const selector = payload.selector as string;
        const text = payload.text as string;
        const el = selector ? document.querySelector(selector) : document.activeElement;

        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          el.focus();
          el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          throw new Error("No editable element found");
        }
        break;
      }

      case "scroll": {
        const scrollX = payload.x as number;
        const scrollY = payload.y as number;
        if (typeof scrollX === "number" && typeof scrollY === "number") {
          window.scrollTo(scrollX, scrollY);
        } else if (typeof scrollY === "number") {
          window.scrollTo(0, scrollY);
        }
        break;
      }

      case "capture": {
        // Capture is handled by the controller sending a data URL
        // This just acknowledges the command
        break;
      }

      case "mouse_move": {
        // Forward mouse move to update hover states
        const mx = payload.x as number;
        const my = payload.y as number;
        if (typeof mx === "number" && typeof my === "number") {
          const px = mx >= 0 && mx <= 1 ? Math.round(mx * window.innerWidth) : mx;
          const py = my >= 0 && my <= 1 ? Math.round(my * window.innerHeight) : my;
          const el = document.elementFromPoint(px, py);
          if (el) {
            el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: px, clientY: py, view: window }));
          }
        }
        break;
      }

      case "key_press": {
        const key = payload.key as string;
        const code = payload.code as string;
        const activeEl = document.activeElement;
        if (activeEl && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement)) {
          if (key.length === 1) {
            activeEl.value += key;
          } else if (key === "Backspace") {
            activeEl.value = activeEl.value.slice(0, -1);
          } else if (key === "Enter") {
            activeEl.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            activeEl.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          }
          activeEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
        break;
      }

      default:
        throw new Error(`Unknown command: ${commandType}`);
    }
  } catch (err) {
    result = "error";
    error = err instanceof Error ? err.message : "Unknown error";
  }

  const duration = Date.now() - startTime;

  // Add to log
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  commandLog.push({
    time,
    text: `${commandType} ${payload.selector || payload.url || ""} — ${duration}ms`,
    status: result === "success" ? "ok" : "error",
  });
  if (commandLog.length > 100) commandLog.shift();
  updateLog();

  // Send result back
  send({
    type: "command_result",
    payload: { cmdId, result, duration, error, peerId },
  });
}

function startCaptureStream() {
  if (!config) return;
  chrome.runtime.sendMessage({
    type: "startCapture",
    wsUrl: config.relayUrl,
    sessionId: config.sessionId,
  });
}

function stopCaptureStream() {
  chrome.runtime.sendMessage({ type: "stopCapture" });
}

function flashElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  flashElementAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function flashElementAt(x: number, y: number) {
  const flash = document.createElement("div");
  const size = 40;
  flash.style.cssText = `
    position: fixed;
    top: ${y - size / 2}px;
    left: ${x - size / 2}px;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.3);
    pointer-events: none;
    z-index: 2147483646;
    transition: opacity 300ms ease-out;
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.5);
  `;
  document.body.appendChild(flash);
  requestAnimationFrame(() => {
    flash.style.opacity = "0";
    flash.style.transform = "scale(2)";
    setTimeout(() => flash.remove(), 300);
  });
}

// UI Creation
function createUI() {
  if (barContainer) return;

  barContainer = document.createElement("div");
  barContainer.id = "socketscope-container";

  const shadow = barContainer.attachShadow({ mode: "closed" });
  shadowRoot = shadow;

  // Styles
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    }
    .scope-bar {
      position: fixed;
      top: 16px;
      right: 16px;
      height: 48px;
      background: #1E1E1E;
      border: 1px solid #333333;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      z-index: 2147483647;
      box-shadow: 4px 4px 0px rgba(0,0,0,0.8);
      user-select: none;
      cursor: default;
    }
    .scope-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .scope-dot.connected {
      background: #00FF41;
      box-shadow: 0 0 6px #00FF41;
      animation: pulse-green 2s infinite;
    }
    .scope-dot.disconnected {
      background: #FF2D2D;
      box-shadow: 0 0 6px #FF2D2D;
    }
    .scope-dot.connecting {
      background: #FFD600;
      animation: pulse-yellow 1s infinite;
    }
    @keyframes pulse-green {
      0% { box-shadow: 0 0 0 0 rgba(0, 255, 65, 0.7); }
      70% { box-shadow: 0 0 0 8px rgba(0, 255, 65, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 255, 65, 0); }
    }
    @keyframes pulse-yellow {
      0% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0.7); }
      70% { box-shadow: 0 0 0 8px rgba(255, 214, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 214, 0, 0); }
    }
    .scope-label {
      font-size: 12px;
      color: #8A8A8A;
      font-weight: 400;
    }
    .scope-id {
      font-size: 11px;
      font-weight: 600;
      color: #00D4FF;
      background: #2A2A2A;
      padding: 2px 8px;
      letter-spacing: 0.5px;
      cursor: pointer;
    }
    .scope-id:hover {
      background: #333333;
    }
    .scope-peers {
      font-size: 11px;
      color: #E0E0E0;
      background: #2A2A2A;
      padding: 2px 8px;
    }
    .scope-latency {
      font-size: 11px;
      padding: 2px 8px;
    }
    .scope-latency.good {
      color: #00FF41;
    }
    .scope-latency.warn {
      color: #FFD600;
    }
    .scope-latency.bad {
      color: #FF2D2D;
    }
    .scope-btn {
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      background: #1E1E1E;
      border: 1px solid #333333;
      color: #E0E0E0;
      cursor: pointer;
      box-shadow: 2px 2px 0px #333333;
      transition: all 0.1s;
    }
    .scope-btn:hover {
      border-color: #00D4FF;
      box-shadow: 2px 2px 0px #00D4FF;
    }
    .scope-btn:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 transparent;
    }
    .scope-panel {
      position: fixed;
      top: 72px;
      right: 16px;
      width: 360px;
      height: 480px;
      background: #141414;
      border: 1px solid #333333;
      z-index: 2147483647;
      box-shadow: 4px 4px 0px rgba(0,0,0,0.8);
      display: none;
      flex-direction: column;
    }
    .scope-panel.open {
      display: flex;
    }
    .scope-log {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      font-size: 11px;
      line-height: 1.6;
    }
    .scope-log-entry {
      padding: 2px 0;
      color: #8A8A8A;
      word-break: break-all;
    }
    .scope-log-entry .time {
      color: #505050;
    }
    .scope-log-entry .cmd {
      color: #00D4FF;
    }
    .scope-log-entry .ok {
      color: #00FF41;
    }
    .scope-log-entry .err {
      color: #FF2D2D;
    }
    .scope-input-row {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-top: 1px solid #333333;
    }
    .scope-input {
      flex: 1;
      background: #0A0A0A;
      border: 1px solid #333333;
      color: #E0E0E0;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }
    .scope-input:focus {
      border-color: #00D4FF;
    }
    .scrim {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10,10,10,0.85);
      z-index: 2147483646;
      display: none;
    }
    .scrim.open {
      display: block;
    }
    .scope-toast {
      position: fixed;
      top: 72px;
      right: 16px;
      background: #1E1E1E;
      border: 1px solid #333333;
      border-left: 3px solid #00D4FF;
      padding: 12px 16px;
      color: #E0E0E0;
      font-size: 12px;
      z-index: 2147483647;
      transform: translateX(120%);
      transition: transform 0.3s ease-out;
      max-width: 280px;
    }
    .scope-toast.show {
      transform: translateX(0);
    }
  `;
  shadow.appendChild(style);

  // Bar
  const bar = document.createElement("div");
  bar.className = "scope-bar";
  bar.innerHTML = `
    <div class="scope-dot disconnected" id="scope-dot"></div>
    <span class="scope-label">SocketScope</span>
    <span class="scope-id" id="scope-id" title="Click to copy">--</span>
    <span class="scope-peers" id="scope-peers">0 peers</span>
    <span class="scope-latency" id="scope-latency">--ms</span>
    <button class="scope-btn" id="scope-toggle">Connect</button>
    <button class="scope-btn" id="scope-expand">&gt;</button>
  `;
  shadow.appendChild(bar);

  // Panel
  const panel = document.createElement("div");
  panel.className = "scope-panel";
  panel.id = "scope-panel";
  panel.innerHTML = `
    <div class="scope-log" id="scope-log"></div>
    <div class="scope-input-row">
      <input class="scope-input" id="scope-cmd-input" placeholder="/command..." />
      <button class="scope-btn" id="scope-send">Send</button>
    </div>
  `;
  shadow.appendChild(panel);

  // Scrim
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.id = "scope-scrim";
  shadow.appendChild(scrim);

  // Toast
  const toast = document.createElement("div");
  toast.className = "scope-toast";
  toast.id = "scope-toast";
  shadow.appendChild(toast);

  // Event listeners
  const idEl = bar.querySelector("#scope-id") as HTMLSpanElement;
  const toggleBtn = bar.querySelector("#scope-toggle") as HTMLButtonElement;
  const expandBtn = bar.querySelector("#scope-expand") as HTMLButtonElement;
  const cmdInput = panel.querySelector("#scope-cmd-input") as HTMLInputElement;
  const sendBtn = panel.querySelector("#scope-send") as HTMLButtonElement;

  idEl.addEventListener("click", () => {
    if (config?.sessionId) {
      navigator.clipboard.writeText(config.sessionId);
      showToast("Session ID copied!");
    }
  });

  toggleBtn.addEventListener("click", () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  });

  expandBtn.addEventListener("click", () => {
    isExpanded = !isExpanded;
    expandBtn.textContent = isExpanded ? "<" : ">";
    panel.classList.toggle("open", isExpanded);
    scrim.classList.toggle("open", isExpanded);
  });

  scrim.addEventListener("click", () => {
    isExpanded = false;
    expandBtn.textContent = ">";
    panel.classList.remove("open");
    scrim.classList.remove("open");
  });

  cmdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = cmdInput.value.trim();
      if (value) {
        sendCommand(value);
        cmdInput.value = "";
      }
    }
    if (e.key === "Escape") {
      isExpanded = false;
      expandBtn.textContent = ">";
      panel.classList.remove("open");
      scrim.classList.remove("open");
    }
  });

  sendBtn.addEventListener("click", () => {
    const value = cmdInput.value.trim();
    if (value) {
      sendCommand(value);
      cmdInput.value = "";
    }
  });

  document.body.appendChild(barContainer);

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sessionId) {
      config = null; // Force reload
    }
  });

  // Auto-connect
  loadConfig().then((cfg) => {
    if (cfg.autoConnect) {
      connect();
    }
  });
}

function sendCommand(input: string) {
  // Parse simple command syntax: /command arg1 arg2...
  // Or: command payload
  let commandType: string;
  let payload: Record<string, unknown> = {};

  if (input.startsWith("/")) {
    const parts = input.slice(1).split(" ");
    commandType = parts[0];
    const args = parts.slice(1);

    switch (commandType) {
      case "navigate":
        payload = { url: args.join(" ") };
        break;
      case "click":
        payload = { selector: args[0] };
        break;
      case "type":
        payload = { selector: args[0], text: args.slice(1).join(" ") };
        break;
      case "scroll":
        payload = { y: parseInt(args[0]) || 0 };
        break;
      default:
        payload = { args };
    }
  } else {
    try {
      const parsed = JSON.parse(input);
      commandType = parsed.type || "unknown";
      payload = parsed.payload || parsed;
    } catch {
      commandType = "raw";
      payload = { text: input };
    }
  }

  send({
    type: "command",
    payload: { commandType, payload },
  });

  // Add to local log
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  commandLog.push({ time, text: `> ${commandType} ${JSON.stringify(payload)}`, status: "ok" });
  if (commandLog.length > 100) commandLog.shift();
  updateLog();
}

function updateUI() {
  if (!shadowRoot) return;

  const dot = shadowRoot.querySelector("#scope-dot") as HTMLDivElement;
  const idEl = shadowRoot.querySelector("#scope-id") as HTMLSpanElement;
  const peersEl = shadowRoot.querySelector("#scope-peers") as HTMLSpanElement;
  const latencyEl = shadowRoot.querySelector("#scope-latency") as HTMLSpanElement;
  const toggleBtn = shadowRoot.querySelector("#scope-toggle") as HTMLButtonElement;

  if (!dot || !idEl) return;

  dot.className = "scope-dot " + (isConnected ? "connected" : ws ? "connecting" : "disconnected");
  idEl.textContent = config?.sessionId?.slice(0, 12) || "--";
  peersEl.textContent = `${peerCount} peer${peerCount !== 1 ? "s" : ""}`;

  if (latency > 0) {
    latencyEl.textContent = `${latency}ms`;
    latencyEl.className = "scope-latency " + (latency < 50 ? "good" : latency < 150 ? "warn" : "bad");
  } else {
    latencyEl.textContent = "--ms";
    latencyEl.className = "scope-latency";
  }

  toggleBtn.textContent = isConnected ? "Disconnect" : "Connect";
}

function updateLog() {
  if (!shadowRoot) return;
  const logEl = shadowRoot.querySelector("#scope-log") as HTMLDivElement;
  if (!logEl) return;

  logEl.innerHTML = commandLog
    .map(
      (entry) =>
        `<div class="scope-log-entry"><span class="time">[${entry.time}]</span> <span class="${entry.status}">${entry.text}</span></div>`
    )
    .join("");

  logEl.scrollTop = logEl.scrollHeight;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string) {
  if (!shadowRoot) return;
  const toast = shadowRoot.querySelector("#scope-toast") as HTMLDivElement;
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "toggle") {
    if (barContainer) {
      const visible = barContainer.style.display !== "none";
      barContainer.style.display = visible ? "none" : "block";
    } else {
      createUI();
    }
    sendResponse({ visible: barContainer?.style.display !== "none" });
  }
  if (message.type === "getStatus") {
    sendResponse({
      isConnected,
      sessionId: config?.sessionId,
      peerCount,
      latency,
    });
  }
  if (message.type === "connect") {
    connect().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "disconnect") {
    disconnect();
    sendResponse({ ok: true });
  }
  return false;
});

// Initialize on load
createUI();
