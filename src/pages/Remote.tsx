import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import {
  Wifi,
  WifiOff,
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

const WS_URL = "ws://localhost:3001/ws";

const COMMAND_TEMPLATES: Record<string, { label: string; icon: React.ElementType; fields: { key: string; label: string; placeholder: string; type?: string }[] }> = {
  click: {
    label: "Click",
    icon: MousePointer,
    fields: [
      { key: "selector", label: "CSS Selector", placeholder: "#submit-btn, .login-button" },
    ],
  },
  type: {
    label: "Type",
    icon: Keyboard,
    fields: [
      { key: "selector", label: "CSS Selector", placeholder: "#username, input[name='email']" },
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
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [latency, setLatency] = useState(0);
  const [pageTitle, setPageTitle] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("click");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<CommandLogEntry[]>([]);
  const [connecting, setConnecting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

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
                  ? {
                      ...log,
                      status: result === "success" ? "success" : "error",
                      duration,
                      errorMessage: error,
                    }
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
        }
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setPeerId("");
      setLatency(0);
      wsRef.current = null;
      setConnecting(false);
    };

    socket.onerror = () => {
      setIsConnected(false);
      setConnecting(false);
    };

    setWs(socket);
  }, [sessionId, relayUrl]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWs(null);
    setIsConnected(false);
    setPeerId("");
    setLatency(0);
  }, []);

  const sendCommand = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const template = COMMAND_TEMPLATES[selectedCommand];
    const payload: Record<string, unknown> = {};
    for (const field of template.fields) {
      if (field.type === "number") {
        payload[field.key] = parseInt(fieldValues[field.key] || "0") || 0;
      } else {
        payload[field.key] = fieldValues[field.key] || "";
      }
    }

    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    wsRef.current.send(
      JSON.stringify({
        type: "command",
        payload: { commandType: selectedCommand, payload },
      })
    );

    const entry: CommandLogEntry = {
      id: cmdId,
      commandType: selectedCommand,
      payload: JSON.stringify(payload),
      status: "pending",
      timestamp: Date.now(),
    };

    setLogs((prev) => [...prev, entry]);
  }, [selectedCommand, fieldValues]);

  const statusColor = isConnected ? "#00FF41" : connecting ? "#FFD600" : "#FF2D2D";
  const statusText = isConnected ? "Connected" : connecting ? "Connecting..." : "Disconnected";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#0A0A0A",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      <nav
        className="flex items-center justify-between px-6"
        style={{ height: 64, borderBottom: "1px solid #222222" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="rounded-full"
            style={{
              width: 10,
              height: 10,
              background: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>
            SocketScope Remote
          </span>
          {isConnected && (
            <span style={{ fontSize: 11, color: "#8A8A8A" }}>
              · {latency}ms
            </span>
          )}
        </div>
        <Link
          to="/dashboard"
          style={{
            fontSize: 12,
            color: "#8A8A8A",
            textDecoration: "none",
          }}
        >
          Dashboard →
        </Link>
      </nav>

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="flex flex-col gap-6">
            <div style={{ background: "#141414", border: "1px solid #333333" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
                <span style={{ fontSize: 12, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Connection
                </span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <label style={{ fontSize: 11, color: "#8A8A8A", display: "block", marginBottom: 4 }}>
                    Session ID
                  </label>
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="sc_xxxxxxxx..."
                    disabled={isConnected}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#0A0A0A",
                      border: "1px solid #333333",
                      color: "#E0E0E0",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={(e) => { if (!isConnected) (e.target as HTMLInputElement).style.borderColor = "#00D4FF"; }}
                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333333"; }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#8A8A8A", display: "block", marginBottom: 4 }}>
                    Relay URL
                  </label>
                  <input
                    type="text"
                    value={relayUrl}
                    onChange={(e) => setRelayUrl(e.target.value)}
                    disabled={isConnected}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "#0A0A0A",
                      border: "1px solid #333333",
                      color: "#E0E0E0",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={(e) => { if (!isConnected) (e.target as HTMLInputElement).style.borderColor = "#00D4FF"; }}
                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333333"; }}
                  />
                </div>
                <button
                  onClick={isConnected ? disconnect : connect}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: isConnected ? "#1E1E1E" : "#00D4FF",
                    border: `1px solid ${isConnected ? "#FF2D2D" : "#00D4FF"}`,
                    color: isConnected ? "#FF2D2D" : "#0A0A0A",
                    fontSize: 14,
                    fontFamily: "inherit",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isConnected ? "2px 2px 0px #FF2D2D" : "2px 2px 0px #00A8CC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {connecting ? (
                    <><Loader2 size={16} className="animate-spin" />Connecting...</>
                  ) : isConnected ? (
                    <><Unlink size={16} />Disconnect</>
                  ) : (
                    <><Link2 size={16} />Connect</>
                  )}
                </button>
              </div>
            </div>

            {isConnected && pageTitle && (
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ background: "#141414", border: "1px solid #333333" }}
              >
                <Globe size={16} style={{ color: "#00D4FF" }} />
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 13, color: "#E0E0E0" }}>
                    {pageTitle}
                  </div>
                  <div className="truncate" style={{ fontSize: 11, color: "#505050" }}>
                    {pageUrl}
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: "#141414", border: "1px solid #333333" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
                <span style={{ fontSize: 12, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Send Command
                </span>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(COMMAND_TEMPLATES).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => { setSelectedCommand(key); setFieldValues({}); }}
                      disabled={!isConnected}
                      className="flex items-center gap-2 px-3 py-2 transition-all"
                      style={{
                        background: selectedCommand === key ? "#00D4FF" : "#1E1E1E",
                        border: `1px solid ${selectedCommand === key ? "#00D4FF" : "#333333"}`,
                        color: selectedCommand === key ? "#0A0A0A" : "#8A8A8A",
                        fontSize: 12,
                        fontFamily: "inherit",
                        fontWeight: selectedCommand === key ? 600 : 400,
                        cursor: isConnected ? "pointer" : "not-allowed",
                        opacity: isConnected ? 1 : 0.5,
                      }}
                    >
                      <template.icon size={14} />
                      {template.label}
                    </button>
                  ))}
                </div>

                {COMMAND_TEMPLATES[selectedCommand].fields.map((field) => (
                  <div key={field.key}>
                    <label style={{ fontSize: 11, color: "#8A8A8A", display: "block", marginBottom: 4 }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type || "text"}
                      value={fieldValues[field.key] || ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && isConnected) sendCommand();
                      }}
                      placeholder={field.placeholder}
                      disabled={!isConnected}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "#0A0A0A",
                        border: "1px solid #333333",
                        color: "#E0E0E0",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                      onFocus={(e) => { if (isConnected) (e.target as HTMLInputElement).style.borderColor = "#00D4FF"; }}
                      onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333333"; }}
                    />
                  </div>
                ))}

                <button
                  onClick={sendCommand}
                  disabled={!isConnected}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: isConnected ? "#00D4FF" : "#1E1E1E",
                    border: `1px solid ${isConnected ? "#00D4FF" : "#333333"}`,
                    color: isConnected ? "#0A0A0A" : "#505050",
                    fontSize: 14,
                    fontFamily: "inherit",
                    fontWeight: 600,
                    cursor: isConnected ? "pointer" : "not-allowed",
                    boxShadow: isConnected ? "2px 2px 0px #00A8CC" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Send size={16} />
                  Send {COMMAND_TEMPLATES[selectedCommand].label}
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex flex-col"
            style={{ background: "#141414", border: "1px solid #333333" }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "#8A8A8A",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Command Log
              </span>
              <span style={{ fontSize: 11, color: "#505050" }}>
                {logs.length} commands
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4" style={{ minHeight: 400, maxHeight: "calc(100vh - 200px)" }}>
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Terminal size={32} style={{ color: "#333333" }} />
                  <span style={{ fontSize: 12, color: "#505050" }}>
                    {isConnected
                      ? "Send a command to get started"
                      : "Connect to a session to send commands"}
                  </span>
                </div>
              )}

              {logs.map((log, i) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 mb-3 pb-3"
                  style={{ borderBottom: i < logs.length - 1 ? "1px solid #222222" : "none" }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {log.status === "pending" ? (
                      <Loader2 size={14} style={{ color: "#FFD600" }} className="animate-spin" />
                    ) : log.status === "success" ? (
                      <CheckCircle2 size={14} style={{ color: "#00FF41" }} />
                    ) : (
                      <XCircle size={14} style={{ color: "#FF2D2D" }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="px-2 py-0.5"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#00D4FF",
                          background: "#2A2A2A",
                        }}
                      >
                        {log.commandType}
                      </span>
                      {log.duration !== undefined && (
                        <span style={{ fontSize: 10, color: "#8A8A8A" }}>
                          <Clock size={10} className="inline mr-1" />
                          {log.duration}ms
                        </span>
                      )}
                    </div>
                    <div
                      className="truncate"
                      style={{ fontSize: 11, color: "#8A8A8A", fontFamily: "monospace" }}
                    >
                      {log.payload}
                    </div>
                    {log.errorMessage && (
                      <div style={{ fontSize: 10, color: "#FF2D2D", marginTop: 2 }}>
                        {log.errorMessage}
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    <span style={{ fontSize: 10, color: "#505050" }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
