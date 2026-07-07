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

function generateSessionId(): string {
  return "sc_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

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

async function saveSessionId(id: string) {
  await chrome.storage.local.set({ sessionId: id });
}

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
      send({ type: "page_info", payload: { title: document.title, url: window.location.href } });
    };
    ws.onmessage = (event) => {
      try { const msg = JSON.parse(event.data) as WSMessage; handleMessage(msg); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      isConnected = false; peerCount = 0; updateUI(); stopHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), 3000);
    };
    ws.onerror = () => { isConnected = false; updateUI(); };
  } catch { isConnected = false; updateUI(); }
}

function disconnect() {
  stopHeartbeat();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  ws?.close(); ws = null; isConnected = false; peerCount = 0; updateUI();
}

function send(msg: WSMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    const start = Date.now();
    send({ type: "heartbeat" });
    const onPong = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === "pong") {
          latency = Date.now() - start;
          send({ type: "rtt", payload: { rtt: latency } });
          updateUI();
          ws?.removeEventListener("message", onPong);
        }
      } catch { /* ignore */ }
    };
    ws?.addEventListener("message", onPong);
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

function handleMessage(msg: WSMessage) {
  switch (msg.type) {
    case "peer_joined":
      peerCount = (msg.payload?.peerCount as number) || peerCount + 1;
      updateUI(); showToast(`Peer joined (${peerCount} connected)`); break;
    case "peer_left":
      peerCount = (msg.payload?.peerCount as number) || Math.max(0, peerCount - 1);
      updateUI(); break;
    case "execute_command": {
      const cmdId = msg.payload?.cmdId as string;
      const commandType = msg.payload?.commandType as string;
      const payload = msg.payload?.payload as Record<string, unknown>;
      const peerId = msg.payload?.peerId as string;
      executeCommand(cmdId, commandType, payload, peerId); break;
    }
  }
}

async function executeCommand(cmdId: string, commandType: string, payload: Record<string, unknown> = {}, peerId: string) {
  const whitelist = config?.commandWhitelist || DEFAULT_COMMANDS;
  if (!whitelist.includes(commandType)) {
    send({ type: "command_result", payload: { cmdId, result: "error", error: `Command "${commandType}" not whitelisted`, peerId } });
    return;
  }
  const startTime = Date.now();
  let result = "success"; let error = "";
  try {
    switch (commandType) {
      case "navigate": { const url = payload.url as string; if (url) window.location.href = url; break; }
      case "click": {
        const selector = payload.selector as string;
        const x = payload.x as number; const y = payload.y as number;
        let el: Element | null = null;
        if (selector) el = document.querySelector(selector);
        else if (typeof x === "number" && typeof y === "number") el = document.elementFromPoint(x, y);
        if (el) { flashElement(el as HTMLElement); (el as HTMLElement).click(); }
        else throw new Error("Element not found");
        break;
      }
      case "type": {
        const selector = payload.selector as string; const text = payload.text as string;
        const el = selector ? document.querySelector(selector) : document.activeElement;
        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          el.focus(); el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else throw new Error("No editable element found");
        break;
      }
      case "scroll": {
        const sx = payload.x as number; const sy = payload.y as number;
        if (typeof sx === "number" && typeof sy === "number") window.scrollTo(sx, sy);
        else if (typeof sy === "number") window.scrollTo(0, sy);
        break;
      }
      case "capture": break;
      default: throw new Error(`Unknown command: ${commandType}`);
    }
  } catch (err) { result = "error"; error = err instanceof Error ? err.message : "Unknown error"; }
  const duration = Date.now() - startTime;
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  commandLog.push({ time, text: `${commandType} ${payload.selector || payload.url || ""} — ${duration}ms`, status: result === "success" ? "ok" : "error" });
  if (commandLog.length > 100) commandLog.shift();
  updateLog();
  send({ type: "command_result", payload: { cmdId, result, duration, error, peerId } });
}

function flashElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const flash = document.createElement("div");
  flash.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;background:rgba(0,212,255,0.2);pointer-events:none;z-index:2147483646;transition:opacity 200ms ease-out;`;
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = "0"; setTimeout(() => flash.remove(), 200); });
}

function createUI() {
  if (barContainer) return;
  barContainer = document.createElement("div");
  barContainer.id = "socketscope-container";
  const shadow = barContainer.attachShadow({ mode: "closed" });
  shadowRoot = shadow;

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace; }
    .scope-bar { position: fixed; top: 16px; right: 16px; height: 48px; background: #1E1E1E; border: 1px solid #333333; display: flex; align-items: center; gap: 12px; padding: 0 16px; z-index: 2147483647; box-shadow: 4px 4px 0px rgba(0,0,0,0.8); user-select: none; cursor: default; }
    .scope-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .scope-dot.connected { background: #00FF41; box-shadow: 0 0 6px #00FF41; animation: pulse-green 2s infinite; }
    .scope-dot.disconnected { background: #FF2D2D; box-shadow: 0 0 6px #FF2D2D; }
    .scope-dot.connecting { background: #FFD600; animation: pulse-yellow 1s infinite; }
    @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(0,255,65,0.7); } 70% { box-shadow: 0 0 0 8px rgba(0,255,65,0); } 100% { box-shadow: 0 0 0 0 rgba(0,255,65,0); } }
    @keyframes pulse-yellow { 0% { box-shadow: 0 0 0 0 rgba(255,214,0,0.7); } 70% { box-shadow: 0 0 0 8px rgba(255,214,0,0); } 100% { box-shadow: 0 0 0 0 rgba(255,214,0,0); } }
    .scope-label { font-size: 12px; color: #8A8A8A; font-weight: 400; }
    .scope-id { font-size: 11px; font-weight: 600; color: #00D4FF; background: #2A2A2A; padding: 2px 8px; letter-spacing: 0.5px; cursor: pointer; }
    .scope-id:hover { background: #333333; }
    .scope-peers { font-size: 11px; color: #E0E0E0; background: #2A2A2A; padding: 2px 8px; }
    .scope-latency { font-size: 11px; padding: 2px 8px; }
    .scope-latency.good { color: #00FF41; } .scope-latency.warn { color: #FFD600; } .scope-latency.bad { color: #FF2D2D; }
    .scope-btn { font-size: 12px; font-weight: 600; padding: 6px 12px; background: #1E1E1E; border: 1px solid #333333; color: #E0E0E0; cursor: pointer; box-shadow: 2px 2px 0px #333333; transition: all 0.1s; }
    .scope-btn:hover { border-color: #00D4FF; box-shadow: 2px 2px 0px #00D4FF; }
    .scope-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 transparent; }
    .scope-panel { position: fixed; top: 72px; right: 16px; width: 360px; height: 480px; background: #141414; border: 1px solid #333333; z-index: 2147483647; box-shadow: 4px 4px 0px rgba(0,0,0,0.8); display: none; flex-direction: column; }
    .scope-panel.open { display: flex; }
    .scope-log { flex: 1; overflow-y: auto; padding: 8px; font-size: 11px; line-height: 1.6; }
    .scope-log-entry { padding: 2px 0; color: #8A8A8A; word-break: break-all; }
    .scope-log-entry .time { color: #505050; } .scope-log-entry .cmd { color: #00D4FF; }
    .scope-log-entry .ok { color: #00FF41; } .scope-log-entry .err { color: #FF2D2D; }
    .scope-input-row { display: flex; gap: 8px; padding: 8px; border-top: 1px solid #333333; }
    .scope-input { flex: 1; background: #0A0A0A; border: 1px solid #333333; color: #E0E0E0; padding: 6px 10px; font-size: 12px; outline: none; }
    .scope-input:focus { border-color: #00D4FF; }
    .scrim { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(10,10,10,0.85); z-index: 2147483646; display: none; }
    .scrim.open { display: block; }
    .scope-toast { position: fixed; top: 72px; right: 16px; background: #1E1E1E; border: 1px solid #333333; border-left: 3px solid #00D4FF; padding: 12px 16px; color: #E0E0E0; font-size: 12px; z-index: 2147483647; transform: translateX(120%); transition: transform 0.3s ease-out; max-width: 280px; }
    .scope-toast.show { transform: translateX(0); }
  `;
  shadow.appendChild(style);

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

  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.id = "scope-scrim";
  shadow.appendChild(scrim);

  const toast = document.createElement("div");
  toast.className = "scope-toast";
  toast.id = "scope-toast";
  shadow.appendChild(toast);

  const idEl = bar.querySelector("#scope-id") as HTMLSpanElement;
  const toggleBtn = bar.querySelector("#scope-toggle") as HTMLButtonElement;
  const expandBtn = bar.querySelector("#scope-expand") as HTMLButtonElement;
  const cmdInput = panel.querySelector("#scope-cmd-input") as HTMLInputElement;
  const sendBtn = panel.querySelector("#scope-send") as HTMLButtonElement;

  idEl.addEventListener("click", () => { if (config?.sessionId) { navigator.clipboard.writeText(config.sessionId); showToast("Session ID copied!"); } });
  toggleBtn.addEventListener("click", () => { if (isConnected) disconnect(); else connect(); });
  expandBtn.addEventListener("click", () => { isExpanded = !isExpanded; expandBtn.textContent = isExpanded ? "<" : ">"; panel.classList.toggle("open", isExpanded); scrim.classList.toggle("open", isExpanded); });
  scrim.addEventListener("click", () => { isExpanded = false; expandBtn.textContent = ">"; panel.classList.remove("open"); scrim.classList.remove("open"); });
  cmdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const v = cmdInput.value.trim(); if (v) { sendCommand(v); cmdInput.value = ""; } }
    if (e.key === "Escape") { isExpanded = false; expandBtn.textContent = ">"; panel.classList.remove("open"); scrim.classList.remove("open"); }
  });
  sendBtn.addEventListener("click", () => { const v = cmdInput.value.trim(); if (v) { sendCommand(v); cmdInput.value = ""; } });

  document.body.appendChild(barContainer);
  chrome.storage.onChanged.addListener((changes) => { if (changes.sessionId) config = null; });
  loadConfig().then((cfg) => { if (cfg.autoConnect) connect(); });
}

function sendCommand(input: string) {
  let commandType: string; let payload: Record<string, unknown> = {};
  if (input.startsWith("/")) {
    const parts = input.slice(1).split(" "); commandType = parts[0]; const args = parts.slice(1);
    switch (commandType) {
      case "navigate": payload = { url: args.join(" ") }; break;
      case "click": payload = { selector: args[0] }; break;
      case "type": payload = { selector: args[0], text: args.slice(1).join(" ") }; break;
      case "scroll": payload = { y: parseInt(args[0]) || 0 }; break;
      default: payload = { args };
    }
  } else {
    try { const parsed = JSON.parse(input); commandType = parsed.type || "unknown"; payload = parsed.payload || parsed; }
    catch { commandType = "raw"; payload = { text: input }; }
  }
  send({ type: "command", payload: { commandType, payload } });
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  commandLog.push({ time, text: `> ${commandType} ${JSON.stringify(payload)}`, status: "ok" });
  if (commandLog.length > 100) commandLog.shift(); updateLog();
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
  if (latency > 0) { latencyEl.textContent = `${latency}ms`; latencyEl.className = "scope-latency " + (latency < 50 ? "good" : latency < 150 ? "warn" : "bad"); }
  else { latencyEl.textContent = "--ms"; latencyEl.className = "scope-latency"; }
  toggleBtn.textContent = isConnected ? "Disconnect" : "Connect";
}

function updateLog() {
  if (!shadowRoot) return;
  const logEl = shadowRoot.querySelector("#scope-log") as HTMLDivElement;
  if (!logEl) return;
  logEl.innerHTML = commandLog.map(e => `<div class="scope-log-entry"><span class="time">[${e.time}]</span> <span class="${e.status}">${e.text}</span></div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(message: string) {
  if (!shadowRoot) return;
  const toast = shadowRoot.querySelector("#scope-toast") as HTMLDivElement;
  if (!toast) return;
  toast.textContent = message; toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "toggle") {
    if (barContainer) { const visible = barContainer.style.display !== "none"; barContainer.style.display = visible ? "none" : "block"; }
    else createUI();
    sendResponse({ visible: barContainer?.style.display !== "none" });
  }
  if (message.type === "getStatus") sendResponse({ isConnected, sessionId: config?.sessionId, peerCount, latency });
  if (message.type === "connect") { connect().then(() => sendResponse({ ok: true })); return true; }
  if (message.type === "disconnect") { disconnect(); sendResponse({ ok: true }); }
  return false;
});

createUI();
