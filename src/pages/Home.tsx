import { Link } from "react-router";
import { ArrowRight, Wifi, MousePointer, Terminal, Shield } from "lucide-react";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#0A0A0A",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      <nav
        className="flex items-center justify-between px-8"
        style={{ height: 64, borderBottom: "1px solid #222222" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 10,
              height: 10,
              background: "#00D4FF",
              boxShadow: "0 0 6px #00D4FF",
            }}
          />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>SocketScope</span>
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-2 px-4 py-2 transition-all"
          style={{
            background: "#1E1E1E",
            border: "1px solid #333333",
            color: "#00D4FF",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "2px 2px 0px #333333",
          }}
        >
          Dashboard <ArrowRight size={14} />
        </Link>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-3xl text-center">
          <h1
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: "#E0E0E0",
              lineHeight: 1.1,
              marginBottom: 24,
            }}
          >
            Remote Control
            <br />
            <span style={{ color: "#00D4FF" }}>Any Webpage</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#8A8A8A",
              lineHeight: 1.6,
              marginBottom: 40,
            }}
          >
            SocketScope turns any browser tab into a remotely controllable session.
            Share your screen, send commands, collaborate in real-time — all through
            a secure WebSocket tunnel.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-3 transition-all"
              style={{
                background: "#00D4FF",
                border: "1px solid #00D4FF",
                color: "#0A0A0A",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "3px 3px 0px #00A8CC",
              }}
            >
              Open Dashboard <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 mt-16 max-w-4xl w-full">
          {[
            { icon: Wifi, title: "WebSocket Tunnel", desc: "Persistent bidirectional connection with automatic reconnection" },
            { icon: MousePointer, title: "Remote Commands", desc: "Click, type, scroll, and navigate from anywhere" },
            { icon: Terminal, title: "Command Audit", desc: "Full logging and history of every remote action" },
            { icon: Shield, title: "Secure by Default", desc: "Command whitelist, session isolation, encrypted transport" },
          ].map((f) => (
            <div key={f.title} className="p-4 text-center" style={{ background: "#141414", border: "1px solid #222222" }}>
              <f.icon size={24} style={{ color: "#00D4FF", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#E0E0E0", marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 11, color: "#8A8A8A", lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-8 py-4 text-center" style={{ borderTop: "1px solid #222222", fontSize: 11, color: "#505050" }}>
        SocketScope v1.0.0 — Remote Browser Control Extension
      </footer>
    </div>
  );
}
