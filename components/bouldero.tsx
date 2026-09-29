"use client";
import { useEffect, useRef, useState } from "react";
import HoldMap from "./hold-map";
import {
  cloudEnabled,
  endSession,
  exportLocalData,
  listAttempts,
  listProjects,
  listSessions,
  saveAttempt,
  saveProject,
  startSession,
  updateProjectStatus,
} from "@/lib/storage";
import { preparePhoto } from "@/lib/photo";
import { reorder } from "@/lib/coordinates";
import type { Attempt, ClimbingSession, Hold, Project } from "@/lib/types";

function Arrow({ back = false }: { back?: boolean }) {
  return <span aria-hidden="true">{back ? "←" : "↗"}</span>;
}
function sessionDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "In progress";
  const minutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function liveDuration(startedAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => value.toString().padStart(2, "0")).join(":");
}
function BoulderArt() {
  return (
    <svg
      className="boulder-art"
      viewBox="0 0 500 400"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M51 347c70-12 116-7 176-5s147 11 220-5"
        stroke="#bec3b3"
        strokeWidth="2"
      />
      <path
        d="m82 323 28-126 99-111 118-20 84 83 25 155-68 31-221-2Z"
        fill="#dedfd2"
      />
      <path d="m110 197 99-111 31 132-93 115-65-10Z" fill="#c9cebb" />
      <path d="m209 86 118-20-35 128-52 24Z" fill="#ececdf" />
      <path d="m292 194 119-45 25 155-68 31-128-117Z" fill="#d3d7c5" />
      <path
        d="m209 86 31 132 52-24 35-128M240 218l-93 115"
        stroke="#b7beaa"
        strokeWidth="1.5"
      />
      <path d="m166 236 15-16 14 4-2 15-17 9Z" fill="#778568" />
      <path d="m208 177 12-13 12 5-4 15-15 2Z" fill="#7e8d6b" />
      <path d="m270 137 15-8 14 9-6 12-20-2Z" fill="#879671" />
      <path d="m313 97 13-5 13 10-9 10-18-3Z" fill="#6f805f" />
      <path d="m248 277 19-8 12 14-9 10-22-3Z" fill="#869873" />
      <path
        d="m273 286-48-55-1-52 58-38 42-41"
        stroke="#fbfcf4"
        strokeWidth="2"
        strokeDasharray="5 7"
      />
      <circle cx="225" cy="231" r="18" fill="#e5f7ac" />
      <text
        x="225"
        y="236"
        textAnchor="middle"
        fontSize="14"
        fontFamily="sans-serif"
        fill="#34442b"
      >
        1
      </text>
      <circle cx="225" cy="179" r="18" fill="#e5f7ac" />
      <text
        x="225"
        y="184"
        textAnchor="middle"
        fontSize="14"
        fontFamily="sans-serif"
        fill="#34442b"
      >
        2
      </text>
      <circle cx="284" cy="140" r="18" fill="#e5f7ac" />
      <text
        x="284"
        y="145"
        textAnchor="middle"
        fontSize="14"
        fontFamily="sans-serif"
        fill="#34442b"
      >
        3
      </text>
      <path
        d="m385 66 4-13m10 24 12-6m-24-24-4-11"
        stroke="#8e9d73"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Bouldero() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [screen, setScreen] = useState<"projects" | "new" | "project" | "start-session" | "history">(
    "projects",
  );
  const [sessions, setSessions] = useState<ClimbingSession[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sessionGym, setSessionGym] = useState("");
  const [attemptNotes, setAttemptNotes] = useState("");
  const [attemptResult, setAttemptResult] = useState<Attempt["result"]>("attempt");
  const [attemptHoldId, setAttemptHoldId] = useState("");
  const [attemptTopOut, setAttemptTopOut] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<Project["status"] | "all">("active");
  const [gymFilter, setGymFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<Project | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [sourceProject, setSourceProject] = useState<Project | null>(null);
  const [creationMode, setCreationMode] = useState<Project["route_mode"] | null>(null);
  const [finishType, setFinishType] = useState<Project["finish_type"]>("hold");
  const [preview, setPreview] = useState("");
  const [holds, setHolds] = useState<Hold[]>([]);
  const [selected, setSelected] = useState("");
  const [color, setColor] = useState("");
  const [grade, setGrade] = useState("");
  const [gym, setGym] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const uploading = useRef(false);
  const projectsRef = useRef<Project[]>([]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  async function refresh() {
    const [next, nextSessions, nextAttempts] = await Promise.all([
      listProjects(),
      listSessions(),
      listAttempts(),
    ]);
    projectsRef.current.forEach((p) => {
      if (p.photo_url.startsWith("blob:")) URL.revokeObjectURL(p.photo_url);
    });
    projectsRef.current = next;
    setProjects(next);
    setSessions(nextSessions);
    setAttempts(nextAttempts);
    return next;
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      projectsRef.current.forEach((p) => {
        if (p.photo_url.startsWith("blob:")) URL.revokeObjectURL(p.photo_url);
      });
    };
  }, []);
  useEffect(
    () => () => {
      if (photo && preview) URL.revokeObjectURL(preview);
    },
    [preview, photo],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (screen !== "new" || (!photo && !sourceProject)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [screen, photo, sourceProject]);
  function start() {
    setColor("");
    setGrade("");
    setGym(activeSession?.gym || "");
    setHolds([]);
    setSelected("");
    setPhoto(null);
    setSourceProject(null);
    setCreationMode(null);
    setFinishType("hold");
    setPreview("");
    setError("");
    setScreen("new");
  }
  function reusePhoto(project: Project) {
    setColor("");
    setGrade("");
    setGym(activeSession?.gym || project.gym);
    setHolds([]);
    setSelected("");
    setPhoto(null);
    setSourceProject(project);
    setCreationMode(null);
    setFinishType("hold");
    setPreview(project.photo_url);
    setError("");
    setScreen("new");
  }
  const activeSession = sessions.find((session) => !session.ended_at) || null;
  useEffect(() => {
    if (!activeSession) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id]);
  const knownGyms = Array.from(
    new Set(projects.map((project) => project.gym).filter(Boolean)),
  ).sort();
  async function beginSession(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionGym.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await startSession(sessionGym);
      setSessions((current) => [session, ...current]);
      setScreen("projects");
      setNotice(`Session started at ${session.gym}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }
  async function finishSession() {
    if (!activeSession || busy) return;
    setBusy(true);
    setError("");
    try {
      const ended = await endSession(activeSession);
      setSessions((current) =>
        current.map((session) => (session.id === ended.id ? ended : session)),
      );
      setNotice("Session saved. Nice work today.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end session.");
    } finally {
      setBusy(false);
    }
  }
  async function addAttempt(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSession || !opened || busy) return;
    const endedHoldId = opened.route_mode === "mapped"
      ? attemptResult === "sent" && opened.finish_type === "hold"
        ? opened.holds.at(-1)?.id || ""
        : attemptHoldId
      : "";
    const toppedOut = opened.route_mode === "mapped" && opened.finish_type === "top_out" && attemptResult === "sent";
    if (opened.route_mode === "mapped" && !endedHoldId && !toppedOut) {
      setError("Choose the hold where this attempt ended.");
      return;
    }
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      project_id: opened.id,
      session_id: activeSession.id,
      result: attemptResult,
      ended_hold_id: endedHoldId || null,
      topped_out: toppedOut,
      notes: attemptNotes.trim(),
      created_at: new Date().toISOString(),
    };
    setBusy(true);
    setError("");
    try {
      await saveAttempt(attempt);
      setAttempts((current) => [attempt, ...current]);
      if (attempt.result === "sent") {
        const updated = await updateProjectStatus(opened, "sent");
        setOpened(updated);
        setProjects((current) => current.map((project) => project.id === updated.id ? updated : project));
      }
      setAttemptNotes("");
      setAttemptHoldId("");
      setAttemptTopOut(false);
      setAttemptResult("attempt");
      setNotice(attempt.result === "sent" ? "Send recorded. Line completed." : "Attempt recorded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save attempt.");
    } finally {
      setBusy(false);
    }
  }
  async function changeProjectStatus(status: Project["status"]) {
    if (!opened || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateProjectStatus(opened, status);
      setOpened(updated);
      setProjects((current) =>
        current.map((project) => project.id === updated.id ? updated : project),
      );
      const label = status === "active" ? "Ongoing" : status === "sent" ? "Completed" : "Archived";
      setNotice(`Line moved to ${label}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update line.");
    } finally {
      setBusy(false);
    }
  }
  function back() {
    if (busy) return;
    if (
      screen === "new" &&
      photo &&
      !window.confirm("Discard this unsaved line?")
    )
      return;
    setError("");
    setScreen("projects");
    setPhoto(null);
    setSourceProject(null);
    setCreationMode(null);
    setPreview("");
  }
  async function choose(file?: File) {
    if (!file || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = await preparePhoto(file);
      setPhoto(blob);
      setSourceProject(null);
      setCreationMode(null);
      setPreview(URL.createObjectURL(blob));
      setHolds([]);
      setSelected("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open photo.");
    } finally {
      setBusy(false);
      uploading.current = false;
    }
  }
  async function save() {
    if (
      (!photo && !sourceProject) ||
      !creationMode ||
      !color.trim() ||
      !grade.trim() ||
      (creationMode === "mapped" && !holds.length) ||
      busy
    ) return;
    setBusy(true);
    setError("");
    const project: Project = {
      id: crypto.randomUUID(),
      name: `${color.trim()} ${grade.trim()}`,
      grade: grade.trim(),
      gym: gym.trim(),
      photo_url: "",
      status: "active",
      created_at: new Date().toISOString(),
      sent_at: null,
      holds: creationMode === "mapped"
        ? holds.map((hold, index) => ({ ...hold, is_top: finishType === "hold" && index === holds.length - 1 }))
        : holds,
      route_mode: creationMode,
      source_project_id: sourceProject?.id || null,
      finish_type: creationMode === "mapped" ? finishType : "hold",
    };
    try {
      await saveProject(project, photo);
      // Do not invite a duplicate save if reloading the list fails after commit.
      setScreen("projects");
      setPhoto(null);
      setSourceProject(null);
      setCreationMode(null);
      setPreview("");
      setNotice("Line saved. Your next climb starts here.");
      const next = await refresh();
      setOpened(next.find((p) => p.id === project.id)!);
      setScreen("project");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save the line. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadBackup() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await exportLocalData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bouldero-0.2.1-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Backup downloaded with your photos and climbing history.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export your data.");
    } finally {
      setBusy(false);
    }
  }
  const statusCounts = {
    active: projects.filter((project) => project.status === "active").length,
    sent: projects.filter((project) => project.status === "sent").length,
    archived: projects.filter((project) => project.status === "archived").length,
  };
  const visibleProjects = projects
    .filter((project) => statusFilter === "all" || project.status === statusFilter)
    .filter((project) => gymFilter === "all" || project.gym === gymFilter)
    .filter((project) => {
      const needle = query.trim().toLocaleLowerCase();
      return !needle || [project.name, project.grade, project.gym]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      if (!activeSession || gymFilter !== "all") return b.created_at.localeCompare(a.created_at);
      const aHere = a.gym === activeSession.gym ? 1 : 0;
      const bHere = b.gym === activeSession.gym ? 1 : 0;
      return bHere - aHere || b.created_at.localeCompare(a.created_at);
    });
  const openedAttempts = opened
    ? attempts.filter((attempt) => attempt.project_id === opened.id)
    : [];
  const sessionHistory = sessions.map((session) => ({
    ...session,
    attempts: attempts.filter((attempt) => attempt.session_id === session.id),
  }));
  const totalSends = attempts.filter((attempt) => attempt.result === "sent").length;
  function openProject(project: Project) {
    setOpened(project);
    setScreen("project");
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={back} aria-label="Bouldero home">
          <span className="brand-mark">
            b<span>·</span>
          </span>
          bouldero<span className="brand-period">.</span>
        </button>
        <div className="header-note">
          <span className="status-dot" /> ONE HOLD AT A TIME
        </div>
        <span className="version">FIELD NOTES / 0.2.1</span>
      </header>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            {screen === "projects" && (
              <button
                onClick={() => {
                  setError("");
                  setLoading(true);
                  refresh()
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {screen === "projects" && (
          <>
            <section className="page-intro">
              <div>
                <p className="eyebrow">
                  {activeSession ? "SESSION IN PROGRESS" : "YOUR CLIMBING NOTEBOOK"}
                </p>
                <h1>{activeSession ? <>{activeSession.gym}<br /><span>Keep moving.</span></> : <>Ready when<br /><span>you are.</span></>}</h1>
                <p className="intro-copy">
                  {activeSession
                    ? `Started ${new Date(activeSession.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Open a line to record an attempt.`
                    : "Start a session to record attempts, sends, and notes."}
                </p>
                {activeSession && (
                  <div className="session-clock" aria-label="Session elapsed time">
                    <span>SESSION TIME</span>
                    <strong>{liveDuration(activeSession.started_at, clockNow)}</strong>
                  </div>
                )}
              </div>
              <div className="hero-actions">
                {activeSession ? (
                  <>
                    <button className="button primary new-project" onClick={start}>
                      <span className="plus">+</span> New line <Arrow />
                    </button>
                    <button className="button secondary" disabled={busy} onClick={finishSession}>End session</button>
                    <button className="text-button" onClick={() => setScreen("history")}>History</button>
                  </>
                ) : (
                  <>
                    <button className="button primary new-project" onClick={() => {
                      setSessionGym(knownGyms[0] || "");
                      setScreen("start-session");
                    }}>
                      Start a session <Arrow />
                    </button>
                    <button className="text-button" onClick={start}>+ New line</button>
                    <button className="text-button" onClick={() => setScreen("history")}>History</button>
                  </>
                )}
              </div>
            </section>
            <div className="section-heading library-heading">
              <h2>Line library <span className="count">{visibleProjects.length.toString().padStart(2, "0")}</span></h2>
              <span className="small-note">{activeSession ? `${activeSession.gym} lines appear first.` : "Find the line you need."}</span>
            </div>
            <section className="library-controls" aria-label="Line library controls">
              <div className="status-tabs" role="group" aria-label="Filter by status">
                {([
                  ["active", "Ongoing", statusCounts.active],
                  ["sent", "Completed", statusCounts.sent],
                  ["archived", "Archived", statusCounts.archived],
                  ["all", "All", projects.length],
                ] as const).map(([value, label, count]) => (
                  <button
                    key={value}
                    className={statusFilter === value ? "active-tab" : ""}
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
              <div className="library-tools">
                <label className="search-lines">
                  <span>⌕</span>
                  <input aria-label="Search lines" type="search" placeholder="Search lines" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <select aria-label="Filter by gym" value={gymFilter} onChange={(event) => setGymFilter(event.target.value)}>
                  <option value="all">All gyms</option>
                  {knownGyms.map((knownGym) => <option key={knownGym} value={knownGym}>{knownGym}</option>)}
                </select>
                <div className="view-toggle" role="group" aria-label="View style">
                  <button aria-label="Thumbnail view" aria-pressed={viewMode === "grid"} className={viewMode === "grid" ? "active-view" : ""} onClick={() => setViewMode("grid")}>▦</button>
                  <button aria-label="List view" aria-pressed={viewMode === "list"} className={viewMode === "list" ? "active-view" : ""} onClick={() => setViewMode("list")}>☷</button>
                </div>
              </div>
            </section>
            {loading ? (
              <div className="empty-card loading">Opening your notebook…</div>
            ) : projects.length === 0 ? (
              <section className="empty-card">
                <div className="art-wrap">
                  <span className="art-tag">THE NEXT MOVE IS YOURS</span>
                  <BoulderArt />
                </div>
                <div className="empty-copy">
                  <span className="mini-label">01 / START SOMETHING</span>
                  <h2>
                    {activeSession ? "No ongoing lines" : "Meet your next"}
                    <br />
                    {activeSession ? "at this gym yet." : "little obsession."}
                  </h2>
                  <p>
                    That route you can’t stop thinking about?
                    <br className="desktop-break" /> Give it a home. Snap a
                    photo, mark the holds,
                    <br className="desktop-break" /> and save it as a line.
                  </p>
                  <button className="button dark" onClick={activeSession ? start : () => {
                    setSessionGym(knownGyms[0] || "");
                    setScreen("start-session");
                  }}>
                    {activeSession ? "Create a line" : "Start your first session"} <Arrow />
                  </button>
                  <span className="under-button">
                    Just you, a wall, and a starting point.
                  </span>
                </div>
              </section>
            ) : visibleProjects.length === 0 ? (
              <section className="filter-empty">
                <span>⌕</span>
                <h2>No lines match.</h2>
                <p>Try another status, gym, or search.</p>
                <button className="button secondary" onClick={() => {
                  setStatusFilter("all");
                  setGymFilter("all");
                  setQuery("");
                }}>Clear filters</button>
              </section>
            ) : (
              <div className={`project-grid ${viewMode === "list" ? "list-view" : ""}`}>
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    open={() => {
                      setOpened(project);
                      setScreen("project");
                    }}
                  />
                ))}
                <button className="add-card" onClick={start}>
                  <span>+</span>Something caught your eye?
                  <strong>
                    Add a line <Arrow />
                  </strong>
                </button>
              </div>
            )}
            <div className="how-it-works">
              <span className="mini-label">A SIMPLE START</span>
              <div>
                <span>01</span>
                <strong>Capture the route</strong>
                <p>A photo of your next line.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Make your map</strong>
                <p>Mark the holds, from start to top.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Come back to it</strong>
                <p>Your line, right where you left it.</p>
              </div>
            </div>
          </>
        )}
        {screen === "history" && (
          <>
            <button className="back-button" onClick={back}><Arrow back /> Home</button>
            <div className="editor-heading history-heading">
              <div>
                <p className="eyebrow">YOUR CLIMBING HISTORY</p>
                <h1>Every session.<br /><span>One timeline.</span></h1>
                <p className="intro-copy">Look back at the lines, attempts, sends, and notes that got you here.</p>
              </div>
            </div>
            <section className="history-stats" aria-label="Climbing statistics">
              <div><span>Sessions</span><strong>{sessions.length}</strong></div>
              <div><span>Attempts</span><strong>{attempts.length}</strong></div>
              <div><span>Sends</span><strong>{totalSends}</strong></div>
              <div><span>Latest</span><strong>{sessions[0] ? new Date(sessions[0].started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</strong></div>
            </section>
            <div className="section-heading timeline-title">
              <h2>Session timeline <span className="count">{sessions.length.toString().padStart(2, "0")}</span></h2>
              <span className="small-note">Newest first.</span>
            </div>
            {sessionHistory.length === 0 ? (
              <section className="filter-empty history-empty">
                <span>↗</span>
                <h2>Your first session starts the story.</h2>
                <p>Choose a gym and record an attempt to see it here.</p>
                <button className="button primary" onClick={() => {
                  setSessionGym(knownGyms[0] || "");
                  setScreen("start-session");
                }}>Start a session <Arrow /></button>
              </section>
            ) : (
              <section className="timeline">
                {sessionHistory.map((session) => {
                  const lineIds = Array.from(new Set(session.attempts.map((attempt) => attempt.project_id)));
                  return (
                    <article className="session-entry" key={session.id}>
                      <div className="timeline-marker"><i /></div>
                      <header>
                        <div>
                          <time>{new Date(session.started_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</time>
                          <h2>{session.gym}</h2>
                        </div>
                        <span className={session.ended_at ? "" : "live-session"}>{sessionDuration(session.started_at, session.ended_at)}</span>
                      </header>
                      <div className="session-summary">
                        <span>{lineIds.length} {lineIds.length === 1 ? "line" : "lines"}</span>
                        <span>{session.attempts.length} attempts</span>
                        <span>{session.attempts.filter((attempt) => attempt.result === "sent").length} sends</span>
                      </div>
                      {lineIds.length === 0 ? <p className="no-attempts">No attempts recorded in this session.</p> : (
                        <div className="session-lines">
                          {lineIds.map((projectId) => {
                            const project = projects.find((item) => item.id === projectId);
                            if (!project) return null;
                            const lineAttempts = session.attempts.filter((attempt) => attempt.project_id === projectId);
                            return (
                              <button key={projectId} className="timeline-line" onClick={() => openProject(project)}>
                                <img src={project.photo_url} alt="" />
                                <span className="timeline-line-copy">
                                  <strong>{project.name}</strong>
                                  <small>{lineAttempts.length} attempts · {lineAttempts.filter((attempt) => attempt.result === "sent").length} sends</small>
                                  {lineAttempts.filter((attempt) => attempt.notes).map((attempt) => <em key={attempt.id}>“{attempt.notes}”</em>)}
                                </span>
                                <Arrow />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
        {screen === "start-session" && (
          <>
            <button className="back-button" disabled={busy} onClick={back}>
              <Arrow back /> Home
            </button>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">START A SESSION</p>
                <h1>Where are you climbing?</h1>
                <p className="intro-copy">Choose a gym to see your ongoing lines there.</p>
              </div>
              <span className="step-label">TODAY / {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}</span>
            </div>
            <form className="session-form" onSubmit={beginSession}>
              <label htmlFor="session-gym">Gym</label>
              <input
                id="session-gym"
                autoFocus
                required
                maxLength={100}
                list="known-gyms"
                placeholder="Enter or choose a gym"
                value={sessionGym}
                disabled={busy}
                onChange={(event) => setSessionGym(event.target.value)}
              />
              <datalist id="known-gyms">
                {knownGyms.map((knownGym) => <option key={knownGym} value={knownGym} />)}
              </datalist>
              {knownGyms.length > 0 && (
                <div className="gym-chips" aria-label="Recent gyms">
                  {knownGyms.map((knownGym) => (
                    <button key={knownGym} type="button" onClick={() => setSessionGym(knownGym)}>{knownGym}</button>
                  ))}
                </div>
              )}
              <button className="button primary" disabled={busy || !sessionGym.trim()}>
                {busy ? "Starting…" : "Start session"} <Arrow />
              </button>
            </form>
          </>
        )}
        {screen === "new" && (
          <>
            <button className="back-button" disabled={busy} onClick={back}>
              <Arrow back /> All lines
            </button>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">A NEW BEGINNING</p>
                <h1>Save a line.</h1>
                <p className="intro-copy">
                  A photo. A few holds. A place to start.
                </p>
              </div>
              <span className="step-label">
                {!photo && !sourceProject
                  ? "01 / CHOOSE A PHOTO"
                  : !creationMode
                    ? "02 / CHOOSE HOW TO TRACK"
                    : "03 / ADD THE DETAILS"}
              </span>
            </div>
            {!photo && !sourceProject ? (
              <div className="upload-panel">
                <div className="upload-icon">↥</div>
                <h2>First, meet the wall.</h2>
                <p>
                  Choose a clear photo of your route.
                  <br />
                  Keep the start and the top in frame.
                </p>
                <label className={`button primary ${busy ? "disabled" : ""}`}>
                  Choose a photo <Arrow />
                  <input
                    aria-label="Choose a photo"
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </label>
                <label className="camera-link">
                  Take a photo
                  <input
                    aria-label="Take a photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy}
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </label>
                <span className="small-note">
                  {busy
                    ? "Preparing your photo…"
                    : "JPEG, PNG or WebP · up to 30 MB"}
                </span>
                {projects.length > 0 && (
                  <div className="saved-photo-strip">
                    <span>or reuse a saved wall photo</span>
                    <div>
                      {projects.slice(0, 4).map((project) => (
                        <button key={project.id} onClick={() => reusePhoto(project)}>
                          <img src={project.photo_url} alt="" />
                          <small>{project.name}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : !creationMode ? (
              <section className="mode-step">
                <div className="mode-photo">
                  <img src={preview} alt="Selected climbing wall" />
                  {sourceProject && <span>Reusing photo from {sourceProject.name}</span>}
                </div>
                <div className="mode-copy">
                  <span className="mini-label">HOW DO YOU WANT TO TRACK IT?</span>
                  <h2>Choose for this line.</h2>
                  <button className="mode-card" onClick={() => setCreationMode("mapped")}>
                    <span className="mode-symbol">⌖</span>
                    <span><strong>Map holds</strong><small>Place each hold on the photo from start to top.</small></span>
                    <Arrow />
                  </button>
                  <button className="mode-card" onClick={() => setCreationMode("count_only")}>
                    <span className="mode-symbol">+1</span>
                    <span><strong>Count only</strong><small>For warm-ups and lines where only the attempt count matters.</small></span>
                    <Arrow />
                  </button>
                </div>
              </section>
            ) : (
              <div className="editor-layout">
                <section className="mapping-panel">
                  <div className="map-heading">
                    <strong>{creationMode === "mapped" ? "Tap each hold in climbing order." : "Count-only line — no markers needed."}</strong>
                    <span>{creationMode === "mapped" ? `${holds.length} holds` : "WARM-UP FRIENDLY"}</span>
                  </div>
                  <HoldMap
                    src={preview}
                    holds={holds}
                    editable={creationMode === "mapped" && !busy}
                    selected={selected}
                    onSelect={setSelected}
                    onChange={(nextHolds) => setHolds(nextHolds.map((hold, index) => ({
                      ...hold,
                      is_top: finishType === "hold" && index === nextHolds.length - 1,
                    })))}
                  />
                  {creationMode === "mapped" ? <><div className="map-toolbar">
                    <button
                      className="button secondary"
                      disabled={!holds.length || busy}
                      onClick={() => {
                        setHolds(holds.slice(0, -1));
                        setSelected("");
                      }}
                    >
                      ↶ Undo last hold
                    </button>
                    <button
                      className="text-button danger"
                      disabled={!selected || busy}
                      onClick={() => {
                        setHolds(
                          reorder(holds.filter((h) => h.id !== selected)),
                        );
                        setSelected("");
                      }}
                    >
                      Delete selected
                    </button>
                  </div>
                  <p className="map-hint">
                    Drag a marker to move it. Tap a marker to select it.
                    <br />
                    With a keyboard, use arrow keys to move the selected marker.
                  </p>
                  </> : <p className="map-hint">Each tap of “Add attempt” increases this line’s count. You can still attach notes or mark a send.</p>}
                </section>
                <form
                  className="details-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  <span className="mini-label">THE LITTLE DETAILS</span>
                  <h2>What’s the line?</h2>
                  <label>
                    Color
                    <input
                      autoComplete="off"
                      placeholder="e.g. Purple"
                      maxLength={40}
                      required
                      value={color}
                      disabled={busy}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </label>
                  <label>
                    Grade
                    <input
                      placeholder="e.g. V4 or 6B"
                      maxLength={24}
                      required
                      value={grade}
                      disabled={busy}
                      onChange={(e) => setGrade(e.target.value)}
                    />
                  </label>
                  <label>
                    Gym <span>optional</span>
                    <input
                      placeholder="Your local spot"
                      maxLength={100}
                      value={gym}
                      disabled={busy}
                      onChange={(e) => setGym(e.target.value)}
                    />
                  </label>
                  {creationMode === "mapped" && <fieldset className="finish-type">
                    <legend>How does this line finish?</legend>
                    <button type="button" className={finishType === "hold" ? "selected-result" : ""} onClick={() => {
                      setFinishType("hold");
                      setHolds(holds.map((hold, index) => ({ ...hold, is_top: index === holds.length - 1 })));
                    }}>
                      <strong>Finish hold</strong><span>Control the last marked hold.</span>
                    </button>
                    <button type="button" className={finishType === "top_out" ? "selected-result" : ""} onClick={() => {
                      setFinishType("top_out");
                      setHolds(holds.map((hold) => ({ ...hold, is_top: false })));
                    }}>
                      <strong>Top out</strong><span>Finish by climbing onto the wall top.</span>
                    </button>
                  </fieldset>}
                  <button
                    className="button primary save-button"
                    disabled={busy || !color.trim() || !grade.trim() || (creationMode === "mapped" && !holds.length)}
                  >
                    {busy ? "Saving your line…" : "Done · Save line"}
                    <Arrow />
                  </button>
                  <p className="save-note">
                    {creationMode === "count_only"
                      ? "No markers needed. Attempts will become the count."
                      : !holds.length
                        ? "Add at least one hold to save your route."
                        : `${holds.length} holds mapped. Ready when you are.`}
                  </p>
                </form>
              </div>
            )}
          </>
        )}
        {screen === "project" && opened && (
          <>
            <button className="back-button" onClick={back}>
              <Arrow back /> All lines
            </button>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">{opened.route_mode === "count_only" ? "COUNT-ONLY LINE" : "YOUR ROUTE, MAPPED"}</p>
                <h1>{opened.name}</h1>
                <p className="intro-copy">
                  {[opened.grade, opened.gym].filter(Boolean).join(" · ") ||
                    "A new line. A fresh start."}
                </p>
              </div>
              <span className="pill">
                {opened.status === "active" ? "Ongoing" : opened.status === "sent" ? "Completed" : "Archived"}
              </span>
            </div>
            <div className="editor-layout">
              <section className="mapping-panel">
                <HoldMap src={opened.photo_url} holds={opened.holds} />
              </section>
              <aside className="project-details">
                <div className="status-actions" aria-label="Line status">
                  {opened.status !== "active" && <button disabled={busy} onClick={() => changeProjectStatus("active")}>Move to ongoing</button>}
                  {opened.status !== "sent" && <button disabled={busy} onClick={() => changeProjectStatus("sent")}>Mark completed</button>}
                  {opened.status !== "archived" && <button disabled={busy} onClick={() => changeProjectStatus("archived")}>Archive</button>}
                </div>
                <span className="mini-label">ATTEMPT LOG</span>
                <h2>{activeSession && opened.status === "active" ? "How did it go?" : opened.status !== "active" ? "Move to ongoing to log." : "Start a session to log."}</h2>
                {activeSession && opened.status === "active" ? (
                  <form className="attempt-form" onSubmit={addAttempt}>
                    <div className="result-options" role="group" aria-label="Attempt result">
                      <button type="button" className={attemptResult === "attempt" ? "selected-result" : ""} onClick={() => {
                        setAttemptResult("attempt");
                        setAttemptTopOut(false);
                      }}>Attempted</button>
                      <button type="button" className={attemptResult === "sent" ? "selected-result" : ""} onClick={() => {
                        setAttemptResult("sent");
                        if (opened.finish_type === "top_out") {
                          setAttemptHoldId("");
                          setAttemptTopOut(true);
                        } else {
                          setAttemptHoldId(opened.holds.at(-1)?.id || "");
                          setAttemptTopOut(false);
                        }
                      }}>Sent</button>
                    </div>
                    {opened.route_mode === "mapped" && (
                      <div className="attempt-hold-picker">
                        <label>Where did you finish? <span>required</span></label>
                        <p>Tap the last hold you controlled.</p>
                        <HoldMap
                          src={opened.photo_url}
                          holds={opened.holds}
                          selectable
                          selected={attemptHoldId}
                          onSelect={(id) => {
                            setAttemptHoldId(id);
                            setAttemptTopOut(false);
                            setAttemptResult("attempt");
                          }}
                        />
                        {opened.finish_type === "top_out" && <button type="button" className={`top-out-choice ${attemptTopOut ? "selected-result" : ""}`} onClick={() => {
                          setAttemptHoldId("");
                          setAttemptTopOut(true);
                          setAttemptResult("sent");
                        }}>TOP OUT</button>}
                        <strong>{attemptTopOut ? "Reached TOP OUT" : attemptHoldId ? `Reached hold ${opened.holds.find((hold) => hold.id === attemptHoldId)?.order_index}` : "No finish selected"}</strong>
                      </div>
                    )}
                    <label htmlFor="attempt-notes">Notes <span>optional</span></label>
                    <textarea
                      id="attempt-notes"
                      maxLength={500}
                      rows={4}
                      placeholder="What worked? What will you try next?"
                      value={attemptNotes}
                      disabled={busy}
                      onChange={(event) => setAttemptNotes(event.target.value)}
                    />
                    <button className="button primary save-button" disabled={busy || (opened.route_mode === "mapped" && !attemptHoldId && !attemptTopOut)}>
                      {busy ? "Saving…" : "Add attempt"} <Arrow />
                    </button>
                  </form>
                ) : opened.status === "active" ? (
                  <button className="button primary save-button" onClick={() => {
                    setSessionGym(opened.gym || knownGyms[0] || "");
                    setScreen("start-session");
                  }}>Start a session <Arrow /></button>
                ) : null}
                <dl>
                  <div>
                    <dt>{opened.route_mode === "count_only" ? "Tracking" : "Holds mapped"}</dt>
                    <dd>{opened.route_mode === "count_only" ? "Attempts only" : opened.holds.length}</dd>
                  </div>
                  <div>
                    <dt>{opened.route_mode === "count_only" ? "Photo" : "Top hold"}</dt>
                    <dd>{opened.route_mode === "count_only" ? "Saved" : opened.holds.some((h) => h.is_top) ? `Hold ${opened.holds.length}` : "Not marked"}</dd>
                  </div>
                  <div>
                    <dt>Total attempts</dt>
                    <dd>{openedAttempts.length}</dd>
                  </div>
                  <div>
                    <dt>Sends recorded</dt>
                    <dd>{openedAttempts.filter((attempt) => attempt.result === "sent").length}</dd>
                  </div>
                  {opened.sent_at && <div>
                    <dt>Completed</dt>
                    <dd>{new Date(opened.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</dd>
                  </div>}
                </dl>
                <button className="button secondary reuse-button" onClick={() => reusePhoto(opened)}>
                  Create another line from this photo <Arrow />
                </button>
                {openedAttempts.length > 0 && (
                  <div className="attempt-history">
                    <span className="mini-label">RECENT ATTEMPTS</span>
                    {openedAttempts.map((attempt, index) => (
                      <article key={attempt.id}>
                        <div><strong>#{openedAttempts.length - index} · {attempt.result === "sent" ? "Sent" : "Attempted"}</strong><time>{sessions.find((session) => session.id === attempt.session_id)?.gym || "Session"} · {new Date(attempt.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
                        {attempt.topped_out && <small>Reached TOP OUT</small>}
                        {attempt.ended_hold_id && <small>Reached hold {opened.holds.find((hold) => hold.id === attempt.ended_hold_id)?.order_index || "—"}</small>}
                        {attempt.notes && <p>{attempt.notes}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      <footer>
        <span>
          bouldero. <span className="footer-tagline">Keep showing up.</span>
        </span>
        <span>
          {cloudEnabled ? "Private cloud workspace" : "Saved on this device"}
          <span className="footer-dot">·</span>Milestone 2D
        </span>
      </footer>
      {!cloudEnabled && (
        <section className="migration-export" aria-labelledby="migration-title">
          <div>
            <strong id="migration-title">Move your 0.2.1 data</strong>
            <p>
              Download every line, photo, session, and attempt, then import the
              file into Bouldero 0.2.2.
            </p>
          </div>
          <button className="button secondary" disabled={busy} onClick={downloadBackup}>
            {busy ? "Preparing backup…" : "Export backup"} <Arrow />
          </button>
        </section>
      )}
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
        </div>
      )}
    </div>
  );
}
function ProjectCard({
  project,
  open,
}: {
  project: Project;
  open: () => void;
}) {
  return (
    <button className="project-card" onClick={open}>
      <div className="card-photo">
        <img src={project.photo_url} alt={project.name} />
        <span className="card-badge">{project.grade || "LINE"}</span>
        <span className={`card-status status-${project.status}`}>
          {project.status === "active" ? "Ongoing" : project.status === "sent" ? "Completed" : "Archived"}
        </span>
        <span className="card-arrow">
          <Arrow />
        </span>
      </div>
      <div className="card-copy">
        <h3>{project.name}</h3>
        <p>
          {project.route_mode === "count_only" ? "Count only" : `${project.holds.length} holds mapped`}
          <span>
            {project.route_mode === "count_only" ? "Warm-up friendly" : project.holds.some((h) => h.is_top) ? "TOP marked" : "Route saved"}
          </span>
        </p>
      </div>
    </button>
  );
}
