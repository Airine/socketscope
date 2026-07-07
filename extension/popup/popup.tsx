import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";

interface Config {
  relayUrl: string;
  sessionId: string;
  commandWhitelist: string[];
  autoConnect: boolean;
}

interface TabStatus {
  loaded: boolean;
  isConnected?: boolean;
  peerCount?: number;
  latency?: number;
}

function Popup() {
  const [config, setConfig] = useState<Config>({
    relayUrl: "ws://localhost:3001/ws",
    sessionId: "",
    commandWhitelist: ["navigate", "click", "type", "scroll", "capture"],
    autoConnect: true,
  });
  const [tabStatus, setTabStatus] = useState<TabStatus>({ loaded: false });
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getConfig" }, (cfg: Config) => {
      setConfig(cfg);
    });
    refreshTabStatus();
  }, []);

  const refreshTabStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: "getTabStatus" }, (status: TabStatus) => {
      setTabStatus(status);
    });
  }, []);

  const handleConnect = () => {
    if (tabStatus.isConnected) {
      chrome.runtime.sendMessage({ type: "disconnectTab" }, () => {
        setTimeout(refreshTabStatus, 500);
      });
    } else {
      chrome.runtime.sendMessage({ type: "connectTab" }, () => {
        setTimeout(refreshTabStatus, 500);
      });
    }
  };

  const handleCopySessionId = () => {
    navigator.clipboard.writeText(config.sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    const dashboardUrl = chrome.runtime.getURL("") || window.location.origin;
    const link = `${dashboardUrl}#/remote?id=${config.sessionId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateId = () => {
    chrome.runtime.sendMessage({ type: "generateSessionId" }, (result: { sessionId: string }) => {
      setConfig((prev) => ({ ...prev, sessionId: result.sessionId }));
    });
  };

  const handleSaveSettings = () => {
    chrome.runtime.sendMessage(
      { type: "saveConfig", config },
      () => {
        setShowSettings(false);
      }
    );
  };

  const statusColor = tabStatus.isConnected ? "#00FF41" : "#FF2D2D";
  const statusText = tabStatus.isConnected ? "Connected" : "Disconnected";
  const statusSub = tabStatus.isConnected
    ? `to ${config.relayUrl.replace("ws://", "").replace("wss://", "").replace("/ws", "")}`
    : "Ready to connect";

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", minHeight: "520px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: "18px", fontWeight: 600, color: "#E0E0E0" }}>SocketScope</span>
        </div>
        <span
          style={{
            fontSize: "10px",
            padding: "2px 8px",
            background: "#2A2A2A",
            color: "#8A8A8A",
          }}
        >
          v1.0.0
        </span>
      </div>

      <div
        style={{
          padding: "16px",
          background: "#141414",
          border: "1px solid #333333",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div style={{ fontSize: "12px", color: "#8A8A8A" }}>Connection Status</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: "14px", fontWeight: 600, color: statusColor }}>{statusText}</span>
        </div>
        <div style={{ fontSize: "11px", color: "#505050" }}>{statusSub}</div>
      </div>

      <div
        style={{
          padding: "12px",
          background: "#141414",
          border: "1px solid #333333",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "10px", color: "#8A8A8A" }}>SESSION ID</span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#00D4FF",
              letterSpacing: "0.5px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={config.sessionId}
          >
            {config.sessionId || "--"}
          </span>
        </div>
        <button
          onClick={handleCopySessionId}
          style={{
            padding: "6px 12px",
            background: "#1E1E1E",
            border: "1px solid #333333",
            color: "#E0E0E0",
            fontSize: "11px",
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "2px 2px 0px #333333",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={handleConnect}
          style={{
            padding: "10px 16px",
            background: tabStatus.isConnected ? "#1E1E1E" : "#00D4FF",
            border: `1px solid ${tabStatus.isConnected ? "#FF2D2D" : "#00D4FF"}`,
            color: tabStatus.isConnected ? "#FF2D2D" : "#0A0A0A",
            fontSize: "14px",
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: tabStatus.isConnected ? "2px 2px 0px #FF2D2D" : "2px 2px 0px #00A8CC",
          }}
        >
          {tabStatus.isConnected ? "Disconnect" : "Connect"}
        </button>

        <button
          onClick={handleCopyLink}
          style={{
            padding: "10px 16px",
            background: "#1E1E1E",
            border: "1px solid #333333",
            color: "#E0E0E0",
            fontSize: "14px",
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "2px 2px 0px #333333",
          }}
        >
          Copy Session Link
        </button>

        <button
          onClick={handleGenerateId}
          style={{
            padding: "8px 16px",
            background: "#1E1E1E",
            border: "1px solid #333333",
            color: "#8A8A8A",
            fontSize: "12px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Generate New Session ID
        </button>
      </div>

      {tabStatus.loaded && (
        <div
          style={{
            padding: "12px",
            background: "#141414",
            border: "1px solid #333333",
            display: "flex",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ fontSize: "10px", color: "#8A8A8A" }}>PEERS</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#E0E0E0" }}>
              {tabStatus.peerCount ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: "#8A8A8A" }}>LATENCY</div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color:
                  (tabStatus.latency ?? 0) < 50
                    ? "#00FF41"
                    : (tabStatus.latency ?? 0) < 150
                    ? "#FFD600"
                    : "#FF2D2D",
              }}
            >
              {tabStatus.latency ?? "--"}ms
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          padding: "8px",
          background: "transparent",
          border: "none",
          color: "#8A8A8A",
          fontSize: "12px",
          fontFamily: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {showSettings ? "< Hide Settings" : "> Show Settings"}
      </button>

      {showSettings && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "12px",
            background: "#141414",
            border: "1px solid #333333",
          }}
        >
          <div>
            <label style={{ fontSize: "11px", color: "#8A8A8A", display: "block", marginBottom: "4px" }}>
              Relay Server URL
            </label>
            <input
              type="text"
              value={config.relayUrl}
              onChange={(e) => setConfig((p) => ({ ...p, relayUrl: e.target.value }))}
              style={{
                width: "100%",
                padding: "8px",
                background: "#0A0A0A",
                border: "1px solid #333333",
                color: "#E0E0E0",
                fontSize: "12px",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", color: "#8A8A8A", display: "block", marginBottom: "4px" }}>
              Command Whitelist (one per line)
            </label>
            <textarea
              value={config.commandWhitelist.join("\n")}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  commandWhitelist: e.target.value.split("\n").filter(Boolean),
                }))
              }
              rows={5}
              style={{
                width: "100%",
                padding: "8px",
                background: "#0A0A0A",
                border: "1px solid #333333",
                color: "#E0E0E0",
                fontSize: "12px",
                fontFamily: "inherit",
                outline: "none",
                resize: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setConfig((p) => ({ ...p, autoConnect: !p.autoConnect }))}
              style={{
                width: "32px",
                height: "18px",
                background: config.autoConnect ? "#00D4FF" : "#2A2A2A",
                border: "none",
                borderRadius: "9px",
                position: "relative",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  background: "#E0E0E0",
                  borderRadius: "50%",
                  position: "absolute",
                  top: "2px",
                  left: config.autoConnect ? "16px" : "2px",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ fontSize: "12px", color: "#8A8A8A" }}>Auto-connect on load</span>
          </div>

          <button
            onClick={handleSaveSettings}
            style={{
              padding: "10px",
              background: "#00D4FF",
              border: "1px solid #00D4FF",
              color: "#0A0A0A",
              fontSize: "14px",
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "2px 2px 0px #00A8CC",
            }}
          >
            Save Settings
          </button>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid #222222" }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            chrome.tabs.create({ url: `${window.location.origin}/dashboard` });
          }}
          style={{
            fontSize: "12px",
            color: "#00D4FF",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          Open Dashboard →
        </a>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
