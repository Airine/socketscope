import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Activity, Terminal, Settings, BookOpen, Wifi, WifiOff, Save, AlertTriangle } from "lucide-react";

const WS_URL = "ws://localhost:3001/ws";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    relayUrl: "ws://localhost:3001/ws",
    commandWhitelist: ["navigate", "click", "type", "scroll", "capture"],
    autoConnect: true,
  });
  const [saved, setSaved] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?sessionId=settings_check&role=peer`);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    return () => ws.close();
  }, []);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex h-screen" style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>
      <div className="pointer-events-none fixed inset-0" style={{ background: "linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%)", backgroundSize: "100% 4px", zIndex: 9999, opacity: 0.15 }} />
      <aside className="flex-shrink-0 flex flex-col" style={{ width: 240, background: "#141414", borderRight: "1px solid #222222" }}>
        <div className="flex items-center gap-3 px-6" style={{ height: 64, borderBottom: "1px solid #222222" }}>
          <div className="rounded-full" style={{ width: 10, height: 10, background: wsConnected ? "#00FF41" : "#FF2D2D", boxShadow: `0 0 6px ${wsConnected ? "#00FF41" : "#FF2D2D"}` }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>SocketScope</span>
        </div>
        <nav className="flex flex-col py-4 gap-1">
          {[
            { id: "sessions", label: "Sessions", icon: Activity, link: "/dashboard" },
            { id: "commands", label: "Command Log", icon: Terminal, link: "/dashboard" },
            { id: "settings", label: "Settings", icon: Settings },
            { id: "docs", label: "Docs", icon: BookOpen },
          ].map((item) => {
            const isActive = item.id === "settings";
            const content = (<><item.icon size={20} /><span style={{ fontSize: 14 }}>{item.label}</span></>);
            if (item.link) return (<Link key={item.id} to={item.link} className="flex items-center gap-3 px-6 transition-all" style={{ height: 44, borderLeft: "2px solid transparent", background: "transparent", color: "#8A8A8A", textDecoration: "none" }}>{content}</Link>);
            return (<button key={item.id} className="flex items-center gap-3 px-6 w-full text-left" style={{ height: 44, borderLeft: "2px solid #00D4FF", background: "#1E1E1E", color: "#00D4FF", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{content}</button>);
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto" style={{ background: "#0A0A0A" }}>
        <header className="flex items-center justify-between px-6" style={{ height: 64, borderBottom: "1px solid #222222" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#E0E0E0" }}>Settings</h1>
          <div className="flex items-center gap-4" style={{ fontSize: 12, color: "#8A8A8A" }}>
            <div className="flex items-center gap-2 px-3" style={{ height: 28, background: "#1E1E1E", fontSize: 11, color: wsConnected ? "#00FF41" : "#FF2D2D" }}>
              {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {wsConnected ? "Live" : "Offline"}
            </div>
          </div>
        </header>

        <div className="p-6 max-w-2xl">
          <div className="mb-8">
            <label className="block mb-2" style={{ fontSize: 12, color: "#8A8A8A", fontWeight: 400 }}>Relay Server URL</label>
            <input type="text" value={config.relayUrl} onChange={(e) => setConfig((p) => ({ ...p, relayUrl: e.target.value }))}
              style={{ width: "100%", padding: "10px 12px", background: "#141414", border: "1px solid #333333", color: "#E0E0E0", fontSize: 13, fontFamily: "inherit", outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#00D4FF"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#333333"; }} />
            <p style={{ fontSize: 11, color: "#505050", marginTop: 4 }}>Must use ws:// or wss:// protocol</p>
          </div>

          <div className="mb-8 flex items-center gap-4">
            <button onClick={() => setConfig((p) => ({ ...p, autoConnect: !p.autoConnect }))}
              style={{ width: 40, height: 22, background: config.autoConnect ? "#00D4FF" : "#2A2A2A", border: "none", borderRadius: 11, position: "relative", cursor: "pointer", padding: 0, flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, background: "#E0E0E0", borderRadius: "50%", position: "absolute", top: 2, left: config.autoConnect ? 20 : 2, transition: "left 0.2s" }} />
            </button>
            <div>
              <div style={{ fontSize: 13, color: "#E0E0E0" }}>Auto-Connect on Load</div>
              <div style={{ fontSize: 11, color: "#8A8A8A" }}>Automatically connect when the extension loads on a page</div>
            </div>
          </div>

          <div className="mb-8">
            <label className="block mb-2" style={{ fontSize: 12, color: "#8A8A8A", fontWeight: 400 }}>Command Whitelist</label>
            <textarea value={config.commandWhitelist.join("\n")} onChange={(e) => setConfig((p) => ({ ...p, commandWhitelist: e.target.value.split("\n").filter(Boolean) }))} rows={6}
              style={{ width: "100%", padding: "10px 12px", background: "#141414", border: "1px solid #333333", color: "#E0E0E0", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
            <p style={{ fontSize: 11, color: "#505050", marginTop: 4 }}>One command per line. Only these commands will be accepted from remote peers.</p>
          </div>

          <div className="mb-8 p-4" style={{ background: "rgba(255,45,45,0.05)", border: "1px solid rgba(255,45,45,0.2)" }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: "#FF2D2D" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#FF2D2D" }}>Danger Zone</span>
            </div>
            <button style={{ padding: "8px 16px", background: "#1E1E1E", border: "1px solid #FF2D2D", color: "#FF2D2D", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
              Reset All Settings
            </button>
          </div>

          <button onClick={handleSave} className="flex items-center gap-2 transition-all"
            style={{ padding: "12px 24px", background: "#00D4FF", border: "1px solid #00D4FF", color: "#0A0A0A", fontSize: 14, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", boxShadow: "2px 2px 0px #00A8CC" }}>
            <Save size={16} /> Save Settings
          </button>

          {saved && (
            <div className="mt-4 px-4 py-3" style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.3)", color: "#00FF41", fontSize: 12 }}>
              Settings saved successfully.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
