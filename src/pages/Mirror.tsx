import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import {
  Link2,
  Unlink,
  Loader2,
  Monitor,
  Wifi,
  WifiOff,
  Zap,
  ArrowLeft,
  MousePointer,
  Keyboard,
  Eye,
  Layers,
} from "lucide-react";

const WS_URL = "ws://localhost:3001/ws";

export default function Mirror() {
  const [sessionId, setSessionId] = useState("");
  const [relayUrl, setRelayUrl] = useState(WS_URL);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [latency, setLatency] = useState(0);
  const [mirrorReady, setMirrorReady] = useState(false);
  const [snapshotReceived, setSnapshotReceived] = useState(false);
  const [stats, setStats] = useState({ mutations: 0, bytesReceived: 0, lastActivity: 0 });

  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameCountRef = useRef(0);

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
        const dataSize = event.data.length;
        setStats((s) => ({
          ...s,
          bytesReceived: s.bytesReceived + dataSize,
          lastActivity: Date.now(),
        }));

        switch (msg.type) {
          case "snapshot": {
            setSnapshotReceived(true);
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(msg, "*");
            }
            break;
          }
          case "mutations": {
            frameCountRef.current++;
            setStats((s) => ({ ...s, mutations: s.mutations + (msg.mutations?.length || 0) }));
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(msg, "*");
            }
            break;
          }
          case "scroll": {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(msg, "*");
            }
            break;
          }
          case "rtt_update": {
            setLatency(msg.payload?.avgRtt || msg.payload?.rtt || 0);
            break;
          }
          case "page_info": {
            // Could update page title display
            break;
          }
        }
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setSnapshotReceived(false);
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
    setSnapshotReceived(false);
    setLatency(0);
  }, []);

  // Listen for iframe messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case "mirror_ready":
          setMirrorReady(true);
          break;
        case "snapshot_applied":
          setSnapshotReceived(true);
          break;
        case "mirror_click":
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "command",
                payload: {
                  commandType: "click",
                  payload: { x: msg.x, y: msg.y },
                },
              })
            );
          }
          break;
        case "mirror_mousemove":
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "command",
                payload: {
                  commandType: "mouse_move",
                  payload: { x: msg.x, y: msg.y },
                },
              })
            );
          }
          break;
        case "mirror_keydown":
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "command",
                payload: {
                  commandType: "key_press",
                  payload: { key: msg.key, code: msg.code },
                },
              })
            );
          }
          break;
        case "mirror_scroll":
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "command",
                payload: {
                  commandType: "scroll",
                  payload: { x: msg.x, y: msg.y },
                },
              })
            );
          }
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const statusColor = isConnected ? "#00FF41" : connecting ? "#FFD600" : "#FF2D2D";

  return (
    <div
      className="h-screen flex flex-col"
      style={{
        background: "#0A0A0A",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      {/* Header */}
      <nav
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: 56, borderBottom: "1px solid #222222" }}
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
          <span style={{ fontSize: 15, fontWeight: 600, color: "#E0E0E0" }}>
            DOM Mirror
          </span>
          {isConnected && (
            <span style={{ fontSize: 11, color: "#8A8A8A" }}>
              · {latency}ms · {stats.mutations} mutations
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Connection inputs */}
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Session ID"
            disabled={isConnected}
            style={{
              width: 200,
              padding: "6px 10px",
              background: "#0A0A0A",
              border: "1px solid #333333",
              color: "#E0E0E0",
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
            }}
            onFocus={(e) => {
              if (!isConnected) e.currentTarget.style.borderColor = "#00D4FF";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#333333";
            }}
          />
          <input
            type="text"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            disabled={isConnected}
            style={{
              width: 160,
              padding: "6px 10px",
              background: "#0A0A0A",
              border: "1px solid #333333",
              color: "#E0E0E0",
              fontSize: 11,
              fontFamily: "inherit",
              outline: "none",
            }}
            onFocus={(e) => {
              if (!isConnected) e.currentTarget.style.borderColor = "#00D4FF";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#333333";
            }}
          />
          <button
            onClick={isConnected ? disconnect : connect}
            style={{
              padding: "6px 14px",
              background: isConnected ? "#1E1E1E" : "#00D4FF",
              border: `1px solid ${isConnected ? "#FF2D2D" : "#00D4FF"}`,
              color: isConnected ? "#FF2D2D" : "#0A0A0A",
              fontSize: 12,
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {connecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : isConnected ? (
              <Unlink size={13} />
            ) : (
              <Link2 size={13} />
            )}
            {connecting ? "..." : isConnected ? "Disconnect" : "Connect"}
          </button>
          <Link
            to="/dashboard"
            style={{
              fontSize: 12,
              color: "#8A8A8A",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowLeft size={13} />
            Dashboard
          </Link>
        </div>
      </nav>

      {/* Main: Mirror iframe */}
      <main className="flex-1 relative overflow-hidden">
        {/* Loading overlay */}
        {!snapshotReceived && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ background: "#0A0A0A", zIndex: 10 }}
          >
            {isConnected ? (
              <>
                <Layers size={40} style={{ color: "#333333" }} />
                <div
                  className="flex items-center gap-2"
                  style={{ color: "#8A8A8A", fontSize: 13 }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  Waiting for DOM snapshot...
                </div>
                <div style={{ color: "#505050", fontSize: 11 }}>
                  The Extension on the remote side needs to be connected and
                  have DOM mirroring enabled
                </div>
              </>
            ) : (
              <>
                <Monitor size={40} style={{ color: "#333333" }} />
                <div style={{ color: "#8A8A8A", fontSize: 13 }}>
                  Connect to a session to start DOM mirroring
                </div>
                <div style={{ color: "#505050", fontSize: 11, maxWidth: 400, textAlign: "center" }}>
                  DOM Mirror syncs the remote page&apos;s DOM structure to this
                  sandboxed iframe. Your interactions (clicks, typing) are
                  forwarded to the remote browser.
                </div>
                <div
                  className="flex gap-6 mt-4"
                  style={{ color: "#505050", fontSize: 11 }}
                >
                  <span className="flex items-center gap-1">
                    <Zap size={12} /> ~20ms latency
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointer size={12} /> Click-through
                  </span>
                  <span className="flex items-center gap-1">
                    <Keyboard size={12} /> Type forwarding
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Stats bar */}
        {snapshotReceived && (
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-4"
            style={{
              height: 28,
              background: "rgba(10,10,10,0.9)",
              borderBottom: "1px solid #222222",
              zIndex: 5,
              fontSize: 10,
              color: "#8A8A8A",
            }}
          >
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Eye size={10} /> DOM Mirror Active
              </span>
              <span>Mutations: {stats.mutations}</span>
              <span>
                RX: {(stats.bytesReceived / 1024).toFixed(1)}KB
              </span>
            </div>
            <div>
              {latency > 0 && (
                <span style={{ color: latency < 50 ? "#00FF41" : "#FFD600" }}>
                  {latency}ms
                </span>
              )}
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          src="/mirror-frame.html"
          className="w-full h-full"
          style={{
            border: "none",
            background: "#0A0A0A",
            paddingTop: snapshotReceived ? 28 : 0,
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </main>
    </div>
  );
}

function setWs(_ws: WebSocket | null) {
  // Placeholder - ws is managed via wsRef
}
