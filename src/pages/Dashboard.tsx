import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Activity, Terminal, Settings, BookOpen, Wifi, WifiOff, Users, Command, ChevronRight, X, Zap, Server, Eye } from "lucide-react";

interface SessionData {
  sessionId: string;
  pageTitle?: string;
  pageUrl?: string;
  peerCount: number;
  avgLatency: number;
  status: string;
  createdAt: number;
  lastHeartbeat: number;
}

interface CommandEntry {
  id: string;
  peerId: string;
  commandType: string;
  payload: string;
  status: "pending" | "success" | "error";
  duration?: number;
  errorMessage?: string;
  timestamp: number;
}

interface LatencyPoint { time: string; rtt: number; }

const WS_URL = "ws://localhost:3001/ws";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("sessions");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [latencyData, setLatencyData] = useState<LatencyPoint[]>([]);
  const [commandFilter, setCommandFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const sessionsQuery = trpc.session.list.useQuery(undefined, { refetchInterval: 3000 });
  const statsQuery = trpc.session.stats.useQuery(undefined, { refetchInterval: 5000 });
  const commandsQuery = trpc.session.commands.useQuery(
    { sessionId: selectedSession || "" },
    { enabled: !!selectedSession, refetchInterval: 2000 }
  );

  const sessions = (sessionsQuery.data || []) as SessionData[];

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${WS_URL}?sessionId=dashboard_monitor&role=peer`);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "rtt_update") {
            const rtt = msg.payload?.rtt as number;
            if (typeof rtt === "number") {
              setLatencyData((prev) => {
                const now = new Date();
                const time = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`;
                const next = [...prev, { time, rtt }];
                return next.length > 60 ? next.slice(-60) : next;
              });
            }
          }
        } catch { /* ignore */ }
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const openDrawer = useCallback((sessionId: string) => { setSelectedSession(sessionId); setDrawerOpen(true); }, []);

  const filteredCommands = (commandsQuery.data || [])
    .filter((cmd: CommandEntry) => {
      if (commandFilter !== "all" && cmd.commandType !== commandFilter) return false;
      if (statusFilter !== "all" && cmd.status !== statusFilter) return false;
      return true;
    }).reverse();

  return (
    <div className="flex h-screen" style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>
      <div className="pointer-events-none fixed inset-0" style={{ background: "linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,0.25) 50%)", backgroundSize: "100% 4px", zIndex: 9999, opacity: 0.15 }} />
      <aside className="flex-shrink-0 flex flex-col" style={{ width: 240, background: "#141414", borderRight: "1px solid #222222" }}>
        <div className="flex items-center gap-3 px-6" style={{ height: 64, borderBottom: "1px solid #222222" }}>
          <div className="rounded-full" style={{ width: 10, height: 10, background: wsConnected ? "#00FF41" : "#FF2D2D", boxShadow: `0 0 6px ${wsConnected ? "#00FF41" : "#FF2D2D"}` }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>SocketScope</span>
        </div>
        <nav className="flex flex-col py-4 gap-1">
          {[
            { id: "sessions", label: "Sessions", icon: Activity },
            { id: "commands", label: "Command Log", icon: Terminal },
            { id: "settings", label: "Settings", icon: Settings, link: "/dashboard/settings" },
            { id: "docs", label: "Docs", icon: BookOpen },
          ].map((item) => {
            const isActive = activeTab === item.id;
            const content = (<><item.icon size={20} /><span style={{ fontSize: 14 }}>{item.label}</span></>);
            if (item.link) return (<Link key={item.id} to={item.link} className="flex items-center gap-3 px-6 transition-all" style={{ height: 44, borderLeft: isActive ? "2px solid #00D4FF" : "2px solid transparent", background: isActive ? "#1E1E1E" : "transparent", color: isActive ? "#00D4FF" : "#8A8A8A", textDecoration: "none" }}>{content}</Link>);
            return (<button key={item.id} onClick={() => setActiveTab(item.id)} className="flex items-center gap-3 px-6 w-full text-left transition-all" style={{ height: 44, borderLeft: isActive ? "2px solid #00D4FF" : "2px solid transparent", background: isActive ? "#1E1E1E" : "transparent", color: isActive ? "#00D4FF" : "#8A8A8A", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{content}</button>);
          })}
        </nav>
        <div className="mt-auto p-6" style={{ borderTop: "1px solid #222222" }}>
          <div className="grid grid-cols-2 gap-4">
            <div><div style={{ fontSize: 10, color: "#8A8A8A" }}>SESSIONS</div><div style={{ fontSize: 20, fontWeight: 600, color: "#E0E0E0" }}>{statsQuery.data?.totalSessions ?? 0}</div></div>
            <div><div style={{ fontSize: 10, color: "#8A8A8A" }}>PEERS</div><div style={{ fontSize: 20, fontWeight: 600, color: "#E0E0E0" }}>{statsQuery.data?.totalPeers ?? 0}</div></div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto" style={{ background: "#0A0A0A" }}>
        <header className="flex items-center justify-between px-6" style={{ height: 64, borderBottom: "1px solid #222222" }}>
          <div className="flex items-center gap-4">
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "#E0E0E0" }}>
              {activeTab === "sessions" && "Active Sessions"}
              {activeTab === "commands" && "Command Audit"}
            </h1>
            <div className="flex items-center gap-2 px-3" style={{ height: 28, background: "#1E1E1E", fontSize: 11, color: wsConnected ? "#00FF41" : "#FF2D2D" }}>
              {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {wsConnected ? "Live" : "Reconnecting..."}
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ fontSize: 12, color: "#8A8A8A" }}>
            <span>Commands: {statsQuery.data?.totalCommands ?? 0}</span>
            <span>Avg RTT: {statsQuery.data?.avgLatency ?? 0}ms</span>
          </div>
        </header>

        <div className="p-6">
          {activeTab === "sessions" && (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Active Sessions", value: statsQuery.data?.activeSessions ?? 0, icon: Server, color: "#00D4FF" },
                  { label: "Total Peers", value: statsQuery.data?.totalPeers ?? 0, icon: Users, color: "#00FF41" },
                  { label: "Total Commands", value: statsQuery.data?.totalCommands ?? 0, icon: Command, color: "#FFD600" },
                  { label: "Avg Latency", value: `${statsQuery.data?.avgLatency ?? 0}ms`, icon: Zap, color: (statsQuery.data?.avgLatency ?? 0) < 50 ? "#00FF41" : "#FFD600" },
                ].map((card) => (
                  <div key={card.label} className="p-4" style={{ background: "#141414", border: "1px solid #333333" }}>
                    <div className="flex items-center gap-2 mb-2"><card.icon size={16} style={{ color: card.color }} /><span style={{ fontSize: 11, color: "#8A8A8A" }}>{card.label}</span></div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#E0E0E0" }}>{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 2fr" }}>
                <div>
                  <h2 className="mb-4" style={{ fontSize: 14, color: "#8A8A8A", fontWeight: 400 }}>SESSIONS ({sessions.length})</h2>
                  <div className="flex flex-col gap-3">
                    {sessions.map((session: SessionData) => (
                      <SessionCard key={session.sessionId} session={session} onViewLog={() => openDrawer(session.sessionId)} />
                    ))}
                    {sessions.length === 0 && (
                      <div className="p-8 text-center" style={{ background: "#141414", border: "1px solid #333333", color: "#505050" }}>
                        No active sessions. Start the extension on a page to begin.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="mb-4" style={{ fontSize: 14, color: "#8A8A8A", fontWeight: 400 }}>LATENCY MONITOR</h2>
                  <div className="p-4" style={{ background: "#141414", border: "1px solid #333333" }}>
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={latencyData.length > 0 ? latencyData : [{ time: "--", rtt: 0 }]}>
                          <defs><linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} /><stop offset="95%" stopColor="#00D4FF" stopOpacity={0} /></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
                          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#505050", fontFamily: "monospace" }} axisLine={{ stroke: "#333333" }} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#505050", fontFamily: "monospace" }} axisLine={{ stroke: "#333333" }} tickLine={false} unit="ms" />
                          <Tooltip contentStyle={{ background: "#1E1E1E", border: "1px solid #333333", fontSize: 12, fontFamily: "monospace", color: "#E0E0E0" }} />
                          <ReferenceLine y={100} stroke="#FFD600" strokeDasharray="4 4" label={{ value: "100ms", fill: "#FFD600", fontSize: 10 }} />
                          <Area type="monotone" dataKey="rtt" stroke="#00D4FF" strokeWidth={2} fill="url(#latencyGrad)" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "commands" && (
            <CommandAuditView sessions={sessions} selectedSession={selectedSession} onSelectSession={setSelectedSession}
              commandFilter={commandFilter} onCommandFilterChange={setCommandFilter}
              statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} commands={filteredCommands} />
          )}
        </div>
      </main>

      {drawerOpen && selectedSession && (<SessionDrawer sessionId={selectedSession} onClose={() => setDrawerOpen(false)} />)}
    </div>
  );
}

function SessionCard({ session, onViewLog }: { session: SessionData; onViewLog: () => void }) {
  const statusColor = session.status === "connected" ? "#00FF41" : session.status === "error" ? "#FF2D2D" : "#FFD600";
  return (
    <div className="p-4 transition-all cursor-pointer" style={{ background: "#141414", border: "1px solid #333333" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#00D4FF"; (e.currentTarget as HTMLDivElement).style.boxShadow = "2px 2px 0px #00D4FF"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#333333"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: statusColor, boxShadow: `0 0 4px ${statusColor}` }} />
          <span className="truncate" style={{ fontSize: 14, color: "#E0E0E0" }} title={session.pageTitle}>{session.pageTitle || "Untitled Page"}</span>
        </div>
        <span style={{ fontSize: 11, color: "#505050", flexShrink: 0 }}>{new Date(session.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5" style={{ fontSize: 11, fontWeight: 600, color: "#00D4FF", background: "#2A2A2A", letterSpacing: "0.5px" }}>{session.sessionId.slice(0, 16)}...</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, color: "#8A8A8A" }}><Users size={12} className="inline mr-1" />{session.peerCount} peer{session.peerCount !== 1 ? "s" : ""}{session.avgLatency > 0 && (<> · {session.avgLatency}ms</>)}</span>
        <button onClick={onViewLog} className="flex items-center gap-1 transition-colors" style={{ fontSize: 12, color: "#00D4FF", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#E0E0E0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#00D4FF"; }}><Eye size={12} />View Log</button>
      </div>
    </div>
  );
}

function SessionDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const sessionQuery = trpc.session.getById.useQuery({ sessionId });
  const commandsQuery = trpc.session.commands.useQuery({ sessionId }, { refetchInterval: 2000 });
  const session = sessionQuery.data;
  const commands = (commandsQuery.data || []).reverse();

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 10000 }}>
      <div className="absolute inset-0" style={{ background: "rgba(10,10,10,0.85)" }} onClick={onClose} />
      <div className="relative flex flex-col overflow-hidden" style={{ width: 480, background: "#141414", borderLeft: "1px solid #333333", boxShadow: "-4px 0 16px rgba(0,0,0,0.8)" }}>
        <div className="flex items-center justify-between px-6" style={{ height: 64, borderBottom: "1px solid #333333" }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: "#E0E0E0" }}>Session Log</h2><span style={{ fontSize: 11, color: "#00D4FF" }}>{sessionId.slice(0, 20)}...</span></div>
          <button onClick={onClose} className="transition-colors" style={{ background: "none", border: "none", color: "#8A8A8A", cursor: "pointer", padding: 8 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#E0E0E0"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#8A8A8A"; }}><X size={20} /></button>
        </div>
        {session && (
          <div className="p-4" style={{ borderBottom: "1px solid #222222", background: "#1E1E1E" }}>
            <div className="flex items-center gap-2 mb-2"><div className="rounded-full" style={{ width: 8, height: 8, background: session.status === "connected" ? "#00FF41" : "#FF2D2D" }} /><span style={{ fontSize: 12, color: "#8A8A8A" }}>{session.pageTitle || "Untitled"}</span></div>
            <div style={{ fontSize: 11, color: "#505050" }}>{session.pageUrl}</div>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4" style={{ fontSize: 11, lineHeight: 1.8 }}>
          {commands.map((cmd: CommandEntry) => (
            <div key={cmd.id} className="mb-1">
              <span style={{ color: "#505050" }}>[{new Date(cmd.timestamp).toLocaleTimeString()}]</span>{" "}
              <span style={{ color: "#00D4FF" }}>{cmd.commandType}</span>{" "}
              <span style={{ color: "#E0E0E0" }}>{cmd.payload.slice(0, 60)}</span>{" "}
              <span style={{ color: "#8A8A8A" }}>{cmd.duration ? `${cmd.duration}ms` : ""}</span>{" "}
              {cmd.status === "success" ? (<span style={{ color: "#00FF41" }}>✓</span>) : cmd.status === "error" ? (<span style={{ color: "#FF2D2D" }} title={cmd.errorMessage}>✗</span>) : (<span style={{ color: "#FFD600" }}>⋯</span>)}
            </div>
          ))}
          {commands.length === 0 && (<div style={{ color: "#505050", textAlign: "center", paddingTop: 40 }}>No commands executed yet.</div>)}
        </div>
        <div className="p-4" style={{ borderTop: "1px solid #333333" }}>
          <button style={{ width: "100%", padding: "10px", background: "#1E1E1E", border: "1px solid #FF2D2D", color: "#FF2D2D", fontSize: 14, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", boxShadow: "2px 2px 0px #FF2D2D" }}>Force Disconnect</button>
        </div>
      </div>
    </div>
  );
}

function CommandAuditView({ sessions, selectedSession, onSelectSession, commandFilter, onCommandFilterChange, statusFilter, onStatusFilterChange, commands }: any) {
  const commandTypes = ["navigate", "click", "type", "scroll", "capture"];
  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <select value={selectedSession || ""} onChange={(e) => onSelectSession(e.target.value)}
          style={{ padding: "8px 12px", background: "#141414", border: "1px solid #333333", color: "#E0E0E0", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
          <option value="">All Sessions</option>
          {sessions.map((s: SessionData) => (<option key={s.sessionId} value={s.sessionId}>{s.sessionId.slice(0, 16)}... ({s.pageTitle || "Untitled"})</option>))}
        </select>
        <div className="flex gap-2">
          {commandTypes.map((type) => (
            <button key={type} onClick={() => onCommandFilterChange(commandFilter === type ? "all" : type)}
              style={{ padding: "6px 12px", background: commandFilter === type ? "#1E1E1E" : "#141414", border: `1px solid ${commandFilter === type ? "#00D4FF" : "#333333"}`, color: commandFilter === type ? "#00D4FF" : "#8A8A8A", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>{type}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {["all", "success", "error", "pending"].map((status) => (
            <button key={status} onClick={() => onStatusFilterChange(status)}
              style={{ padding: "6px 12px", background: statusFilter === status ? "#00D4FF" : "#141414", border: `1px solid ${statusFilter === status ? "#00D4FF" : "#333333"}`, color: statusFilter === status ? "#0A0A0A" : "#8A8A8A", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: statusFilter === status ? 600 : 400 }}>
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ border: "1px solid #333333" }}>
        <div className="grid gap-4 px-4 items-center" style={{ gridTemplateColumns: "100px 160px 100px 100px 80px 80px", height: 40, background: "#1E1E1E", borderBottom: "1px solid #333333", fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <span>Time</span><span>Session</span><span>Peer</span><span>Command</span><span>Status</span><span>Duration</span>
        </div>
        {commands.map((cmd: CommandEntry, i: number) => (
          <div key={cmd.id} className="grid gap-4 px-4 items-center" style={{ gridTemplateColumns: "100px 160px 100px 100px 80px 80px", height: 36, background: i % 2 === 0 ? "#0A0A0A" : "#141414", fontSize: 11, color: "#E0E0E0" }}>
            <span style={{ color: "#8A8A8A" }}>{new Date(cmd.timestamp).toLocaleTimeString()}</span>
            <span className="truncate" style={{ color: "#00D4FF" }}>{cmd.sessionId?.slice(0, 12) || "--"}...</span>
            <span style={{ color: "#8A8A8A" }}>{cmd.peerId.slice(0, 8)}...</span>
            <span>{cmd.commandType}</span>
            <span>{cmd.status === "success" ? (<span className="px-2 py-0.5" style={{ background: "rgba(0,255,65,0.1)", color: "#00FF41", fontSize: 10 }}>success</span>) : cmd.status === "error" ? (<span className="px-2 py-0.5" style={{ background: "rgba(255,45,45,0.1)", color: "#FF2D2D", fontSize: 10 }}>error</span>) : (<span className="px-2 py-0.5" style={{ background: "rgba(255,214,0,0.1)", color: "#FFD600", fontSize: 10 }}>pending</span>)}</span>
            <span style={{ color: "#8A8A8A" }}>{cmd.duration ? `${cmd.duration}ms` : "--"}</span>
          </div>
        ))}
        {commands.length === 0 && (<div className="py-12 text-center" style={{ color: "#505050", fontSize: 12 }}>No commands match the current filters.</div>)}
      </div>
    </div>
  );
}
