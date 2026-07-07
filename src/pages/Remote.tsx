import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import {
  Send,
  MousePointer,
  Keyboard,
  Globe,
  ArrowDown,
  Camera,
  Link2,
  Unlink,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Crosshair,
  Monitor,
  AlertCircle,
} from "lucide-react";

interface CommandLogEntry {
  id: string;
  commandType: string;
  payload: string;
  status: "pending" | "success" | "error";
  duration?: number;
  errorMessage?: string;
  timestamp: number;
}

interface CaptureFrame {
  image: string;
  timestamp: number;
}

const WS_URL = "ws://localhost:3001/ws";

const COMMAND_TEMPLATES: Record<string, { label: string; icon: React.ElementType; fields: { key: string; label: string; placeholder: string; type?: string }[] }> = {
  click: {
    label: "Click",
    icon: MousePointer,
    fields: [
      { key: "selector", label: "CSS Selector (optional)", placeholder: "#submit-btn or leave empty to use coordinates" },
    ],
  },
  type: {
    label: "Type",
    icon: Keyboard,
    fields: [
      { key: "selector", label: "CSS Selector", placeholder: "#username" },
      { key: "text", label: "Text", placeholder: "Hello World" },
    ],
  },
  navigate: {
    label: "Navigate",
    icon: Globe,
    fields: [
      { key: "url", label: "URL", placeholder: "https://example.com" },
    ],
  },
  scroll: {
    label: "Scroll",
    icon: ArrowDown,
    fields: [
      { key: "y", label: "Y Position", placeholder: "500", type: "number" },
    ],
  },
  capture: {
    label: "Capture",
    icon: Camera,
    fields: [],
  },
};

export default function Remote() {
  const [sessionId, setSessionId] = useState("");
  const [relayUrl, setRelayUrl] = useState(WS_URL);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [latency, setLatency] = useState(0);
  const [pageTitle, setPageTitle] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("click");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [lastFrame, setLastFrame] = useState<CaptureFrame | null>(null);
  const [fps, setFps] = useState(0);
  const [clickMode, setClickMode] = useState(false);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // FPS counter
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsTimeRef.current) / 1000;
      if (elapsed > 0) {
        setFps(Math.round(frameCountRef.current / elapsed));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(() => {
    if (!sessionId.trim() || wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);

    const url = `${relayUrl}?sessionId=${sessionId.trim()}&role=peer`;
    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      setConnecting(false);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "connected":
            setPeerId(msg.payload?.peerId || "");
            break;
          case "command_result": {
            const { cmdId, result, duration, error } = msg.payload || {};
            setLogs((prev) =>
              prev.map((log) =>
                log.id === cmdId
                  ? { ...log, status: result === "success" ? "success" : "error", duration, errorMessage: error }
                  : log
              )
            );
            break;
          }
          case "rtt_update":
            setLatency(msg.payload?.avgRtt || msg.payload?.rtt || 0);
            break;
          case "page_info":
            setPageTitle(msg.payload?.title || "");
            setPageUrl(msg.payload?.url || "");
            break;
          case "capture_frame":
            const img = msg.payload?.image as string;
            const ts = msg.payload?.timestamp as number;
            if (img) {
              setLastFrame({ image: img, timestamp: ts });
              frameCountRef.current++;
            }
            break;
          case "peer_joined":
          case "peer_left":
          case "pong":
          case "command_queued":
            break;
          default:
            // ignore
        }
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setPeerId("");
      setLatency(0);
      setLastFrame(null);
      wsRef.current = null;
      setConnecting(false);
    };

    socket.onerror = () => {
      setIsConnected(false);
      setConnecting(false);
    };

    setWs(socket);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, relayUrl]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setPeerId("");
    setLatency(0);
    setLastFrame(null);
    setClickMode(false);
    setClickPos(null);
  }, []);

  const sendCommand = useCallback((overrideType?: string, overridePayload?: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const cmdType = overrideType || selectedCommand;
    const payload: Record<string, unknown> = overridePayload ? { ...overridePayload } : {};

    if (!overridePayload) {
      for (const field of COMMAND_TEMPLATES[cmdType].fields) {
        if (field.type === "number") {
          payload[field.key] = parseInt(fieldValues[field.key] || "0") || 0;
        } else {
          payload[field.key] = fieldValues[field.key] || "";
        }
      }
    }

    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    wsRef.current.send(
      JSON.stringify({
        type: "command",
        payload: { commandType: cmdType, payload },
      })
    );

    setLogs((prev) => [...prev, {
      id: cmdId,
      commandType: cmdType,
      payload: JSON.stringify(payload),
      status: "pending",
      timestamp: Date.now(),
    }]);
  }, [selectedCommand, fieldValues]);

  // Handle click on the screenshot
  const handleFrameClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!clickMode || !frameRef.current) return;

    const rect = frameRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Send click command with normalized coordinates (0-1)
    sendCommand("click", { x, y });

    // Clear crosshair after 500ms
    setTimeout(() => setClickPos(null), 500);
  }, [clickMode, sendCommand]);

  const statusColor = isConnected ? "#00FF41" : connecting ? "#FFD600" : "#FF2D2D";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A0A0A", fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>
      {/* Header */}
      <nav className="flex items-center justify-between px-6" style={{ height: 64, borderBottom: "1px solid #222222" }}>
        <div className="flex items-center gap-3">
          <div className="rounded-full" style={{ width: 10, height: 10, background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>SocketScope Remote</span>
          {isConnected && (
            <span style={{ fontSize: 11, color: "#8A8A8A" }}>
              · {latency}ms{fps > 0 && ` · ${fps} FPS`}
            </span>
          )}
        </div>
        <Link to="/dashboard" style={{ fontSize: 12, color: "#8A8A8A", textDecoration: "none" }}>Dashboard →</Link>
      </nav>

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto grid gap-6" style={{ gridTemplateColumns: "2fr 1fr" }}>

          {/* Left: Screen View + Connection */}
          <div className="flex flex-col gap-4">
            {/* Connection Bar */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Session ID: sc_xxxxxxxx..."
                disabled={isConnected}
                className="flex-1"
                style={{ padding: "8px 12px", background: "#0A0A0A", border: "1px solid #333333", color: "#E0E0E0", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                onFocus={(e) => { if (!isConnected) e.currentTarget.style.borderColor = "#00D4FF"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#333333"; }}
              />
              <input
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                disabled={isConnected}
                style={{ width: 200, padding: "8px 12px", background: "#0A0A0A", border: "1px solid #333333", color: "#E0E0E0", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                onFocus={(e) => { if (!isConnected) e.currentTarget.style.borderColor = "#00D4FF"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#333333"; }}
              />
              <button
                onClick={isConnected ? disconnect : connect}
                style={{ padding: "8px 16px", background: isConnected ? "#1E1E1E" : "#00D4FF", border: `1px solid ${isConnected ? "#FF2D2D" : "#00D4FF"}`, color: isConnected ? "#FF2D2D" : "#0A0A0A", fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
              >
                {connecting ? (<><Loader2 size={14} className="animate-spin" />...</>) : isConnected ? (<><Unlink size={14} />Disconnect</>) : (<><Link2 size={14} />Connect</>)}
              </button>
            </div>

            {/* Screen View */}
            <div className="relative" style={{ background: "#141414", border: "1px solid #333333", minHeight: 400 }}>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
                <div className="flex items-center gap-2">
                  <Monitor size={14} style={{ color: "#00D4FF" }} />
                  <span style={{ fontSize: 11, color: "#8A8A8A" }}>
                    {pageTitle || (isConnected ? "Waiting for frames..." : "Disconnected")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {lastFrame && (
                    <span style={{ fontSize: 10, color: "#505050" }}>
                      {fps} FPS
                    </span>
                  )}
                  <button
                    onClick={() => setClickMode(!clickMode)}
                    disabled={!isConnected || !lastFrame}
                    style={{
                      padding: "4px 10px",
                      background: clickMode ? "#00D4FF" : "#1E1E1E",
                      border: `1px solid ${clickMode ? "#00D4FF" : "#333333"}`,
                      color: clickMode ? "#0A0A0A" : "#8A8A8A",
                      fontSize: 11,
                      fontFamily: "inherit",
                      cursor: isConnected && lastFrame ? "pointer" : "not-allowed",
                      opacity: isConnected && lastFrame ? 1 : 0.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Crosshair size={12} />
                    {clickMode ? "Click ON" : "Click OFF"}
                  </button>
                </div>
              </div>

              {/* Frame display */}
              <div className="relative" style={{ padding: 8 }}>
                {lastFrame ? (
                  <div className="relative" style={{ cursor: clickMode ? "crosshair" : "default" }}>
                    <img
                      ref={frameRef}
                      src={lastFrame.image}
                      alt="Remote screen"
                      className="w-full"
                      style={{ display: "block", border: "1px solid #222222" }}
                      onClick={handleFrameClick}
                      draggable={false}
                    />
                    {/* Click position overlay */}
                    {clickPos && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: clickPos.x - 12,
                          top: clickPos.y - 12,
                          width: 24,
                          height: 24,
                          border: "2px solid #00D4FF",
                          borderRadius: "50%",
                          boxShadow: "0 0 8px #00D4FF",
                          animation: "pulse-ring 0.5s ease-out forwards",
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-20">
                    {isConnected ? (
                      <>
                        <Loader2 size={32} style={{ color: "#333333" }} className="animate-spin" />
                        <span style={{ fontSize: 12, color: "#505050" }}>Waiting for screen capture frames...</span>
                        <span style={{ fontSize: 11, color: "#333333" }}>Make sure the Extension is connected on the remote side</span>
                      </>
                    ) : (
                      <>
                        <Monitor size={32} style={{ color: "#333333" }} />
                        <span style={{ fontSize: 12, color: "#505050" }}>Connect to a session to view the remote screen</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Click mode hint */}
            {clickMode && lastFrame && (
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.2)", fontSize: 11, color: "#00D4FF" }}>
                <AlertCircle size={14} />
                Click anywhere on the screen to send a click command to the remote page
              </div>
            )}
          </div>

          {/* Right: Commands + Log */}
          <div className="flex flex-col gap-4">
            {/* Command Panel */}
            <div style={{ background: "#141414", border: "1px solid #333333" }}>
              <div className="px-3 py-2" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
                <span style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: "0.5px" }}>Send Command</span>
              </div>
              <div className="p-3 flex flex-col gap-3">
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(COMMAND_TEMPLATES).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => { setSelectedCommand(key); setFieldValues({}); }}
                      disabled={!isConnected}
                      className="flex items-center gap-1 px-2 py-1"
                      style={{
                        background: selectedCommand === key ? "#00D4FF" : "#1E1E1E",
                        border: `1px solid ${selectedCommand === key ? "#00D4FF" : "#333333"}`,
                        color: selectedCommand === key ? "#0A0A0A" : "#8A8A8A",
                        fontSize: 11,
                        fontFamily: "inherit",
                        fontWeight: selectedCommand === key ? 600 : 400,
                        cursor: isConnected ? "pointer" : "not-allowed",
                        opacity: isConnected ? 1 : 0.5,
                      }}
                    >
                      <template.icon size={12} />
                      {template.label}
                    </button>
                  ))}
                </div>
                {COMMAND_TEMPLATES[selectedCommand].fields.map((field) => (
                  <div key={field.key}>
                    <label style={{ fontSize: 10, color: "#8A8A8A", display: "block", marginBottom: 2 }}>{field.label}</label>
                    <input
                      type={field.type || "text"}
                      value={fieldValues[field.key] || ""}
                      onChange={(e) => setFieldValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && isConnected) sendCommand(); }}
                      placeholder={field.placeholder}
                      disabled={!isConnected}
                      style={{ width: "100%", padding: "6px 10px", background: "#0A0A0A", border: "1px solid #333333", color: "#E0E0E0", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                      onFocus={(e) => { if (isConnected) e.currentTarget.style.borderColor = "#00D4FF"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "#333333"; }}
                    />
                  </div>
                ))}
                <button
                  onClick={() => sendCommand()}
                  disabled={!isConnected}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: isConnected ? "#00D4FF" : "#1E1E1E",
                    border: `1px solid ${isConnected ? "#00D4FF" : "#333333"}`,
                    color: isConnected ? "#0A0A0A" : "#505050",
                    fontSize: 12,
                    fontFamily: "inherit",
                    fontWeight: 600,
                    cursor: isConnected ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Send size={12} />
                  Send {COMMAND_TEMPLATES[selectedCommand].label}
                </button>
              </div>
            </div>

            {/* Command Log */}
            <div className="flex flex-col flex-1" style={{ background: "#141414", border: "1px solid #333333", minHeight: 200 }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
                <span style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: "0.5px" }}>Log</span>
                <span style={{ fontSize: 10, color: "#505050" }}>{logs.length}</span>
              </div>
              <div className="flex-1 overflow-auto p-3" style={{ maxHeight: 300 }}>
                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Terminal size={20} style={{ color: "#333333" }} />
                    <span style={{ fontSize: 11, color: "#505050" }}>{isConnected ? "Send a command" : "Connect first"}</span>
                  </div>
                )}
                {logs.map((log, i) => (
                  <div key={log.id} className="flex items-start gap-2 mb-2 pb-2" style={{ borderBottom: i < logs.length - 1 ? "1px solid #222222" : "none" }}>
                    <div className="flex-shrink-0 mt-0.5">
                      {log.status === "pending" ? <Loader2 size={12} style={{ color: "#FFD600" }} className="animate-spin" /> :
                       log.status === "success" ? <CheckCircle2 size={12} style={{ color: "#00FF41" }} /> :
                       <XCircle size={12} style={{ color: "#FF2D2D" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.5" style={{ fontSize: 9, fontWeight: 600, color: "#00D4FF", background: "#2A2A2A" }}>{log.commandType}</span>
                        {log.duration !== undefined && <span style={{ fontSize: 9, color: "#8A8A8A" }}>{log.duration}ms</span>}
                      </div>
                      <div className="truncate" style={{ fontSize: 10, color: "#8A8A8A", fontFamily: "monospace" }}>{log.payload}</div>
                      {log.errorMessage && <div style={{ fontSize: 9, color: "#FF2D2D" }}>{log.errorMessage}</div>}
                    </div>
                    <span style={{ fontSize: 9, color: "#505050", flexShrink: 0 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
