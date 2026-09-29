import { createClient } from "@supabase/supabase-js";
import type { Attempt, ClimbingSession, Project } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudEnabled = Boolean(url && key);
const supabase = cloudEnabled ? createClient(url!, key!) : null;
type StoredProject = Project & { photo?: Blob };
type BackupProject = Omit<StoredProject, "photo"> & {
  photo_data: string | null;
};

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("bouldero-v1", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects"))
        db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sessions"))
        db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("attempts"))
        db.createObjectStore("attempts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Local storage is unavailable. Check your browser storage settings.",
        ),
      );
  });
}
async function localRequest<T>(
  storeName: "projects" | "sessions" | "attempts",
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    let request: IDBRequest<T>;
    try {
      request = action(transaction.objectStore(storeName));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    // Report success only when the transaction is durably committed.
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      reject(
        new Error(
          "Could not save locally. Your browser may be out of storage.",
        ),
      );
    };
  });
}
async function owner() {
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user.id;
  const result = await supabase!.auth.signInAnonymously();
  if (result.error)
    throw new Error(
      `Could not start your private workspace. Enable anonymous sign-ins in Supabase. ${result.error.message}`,
    );
  return result.data.user!.id;
}
export async function listProjects(): Promise<Project[]> {
  if (!supabase) {
    const rows = await localRequest<StoredProject[]>("projects", "readonly", (store) =>
      store.getAll(),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const photoFor = (row: StoredProject): Blob => {
      if (row.photo) return row.photo;
      const source = row.source_project_id && byId.get(row.source_project_id);
      if (!source) throw new Error(`Photo source missing for ${row.name}.`);
      return photoFor(source);
    };
    return rows
      .map(({ photo: _photo, ...project }) => ({
        ...project,
        route_mode: project.route_mode || "mapped",
        source_project_id: project.source_project_id || null,
        finish_type: project.finish_type || "hold",
        photo_url: URL.createObjectURL(photoFor(byId.get(project.id)!)),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  await owner();
  const { data, error } = await supabase
    .from("projects")
    .select("*, holds(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all(
    data.map(async (row) => {
      const { data: photo, error } = await supabase.storage
        .from("project-photos")
        .createSignedUrl(row.photo_url, 86400);
      if (error) throw error;
      return {
        ...row,
        grade: row.grade || "",
        gym: row.gym || "",
        route_mode: row.route_mode || "mapped",
        source_project_id: row.source_project_id || null,
        finish_type: row.finish_type || "hold",
        photo_url: photo.signedUrl,
        holds: row.holds.sort(
          (a: Project["holds"][number], b: Project["holds"][number]) =>
            a.order_index - b.order_index,
        ),
      } as Project;
    }),
  );
}
export async function saveProject(
  project: Project,
  photo: Blob | null,
): Promise<void> {
  if (!supabase) {
    await localRequest("projects", "readwrite", (store) =>
      store.put({ ...project, photo_url: "", ...(photo ? { photo } : {}) }),
    );
    return;
  }
  const userId = await owner();
  const path = photo ? `${userId}/${project.id}.jpg` : null;
  if (photo) {
    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(path!, photo, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
  }
  // The RPC inserts the project and all holds in one database transaction.
  const { error } = await supabase.rpc("create_project_v3", {
    p_id: project.id,
    p_name: project.name,
    p_grade: project.grade,
    p_gym: project.gym,
    p_photo: path,
    p_holds: project.holds,
    p_route_mode: project.route_mode,
    p_source_project_id: project.source_project_id,
    p_finish_type: project.finish_type,
  });
  if (error && path) {
    await supabase.storage.from("project-photos").remove([path]);
    throw error;
  }
  if (error) throw error;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("A saved photo could not be included in the backup."));
    reader.readAsDataURL(blob);
  });
}

export async function exportLocalData(): Promise<Blob> {
  if (supabase)
    throw new Error(
      "Local backup is available when Bouldero is using device storage.",
    );
  const [projects, sessions, attempts] = await Promise.all([
    localRequest<StoredProject[]>("projects", "readonly", (store) =>
      store.getAll(),
    ),
    localRequest<ClimbingSession[]>("sessions", "readonly", (store) =>
      store.getAll(),
    ),
    localRequest<Attempt[]>("attempts", "readonly", (store) => store.getAll()),
  ]);
  const backupProjects: BackupProject[] = await Promise.all(
    projects.map(async ({ photo, ...project }) => ({
      ...project,
      notes: "",
      purpose: "project",
      photo_data: photo ? await blobToDataUrl(photo) : null,
    })),
  );
  return new Blob(
    [
      JSON.stringify({
        kind: "bouldero-backup",
        version: 1,
        exported_at: new Date().toISOString(),
        source_version: "0.2.1",
        projects: backupProjects,
        sessions,
        attempts,
      }),
    ],
    { type: "application/json" },
  );
}

export async function updateProjectStatus(
  project: Project,
  status: Project["status"],
): Promise<Project> {
  const updated: Project = {
    ...project,
    status,
    sent_at: status === "sent" ? project.sent_at || new Date().toISOString() : null,
  };
  if (!supabase) {
    await localRequest("projects", "readwrite", (store) => {
      const request = store.get(project.id) as IDBRequest<StoredProject>;
      request.onsuccess = () => {
        if (!request.result) {
          store.transaction.abort();
          return;
        }
        store.put({
          ...request.result,
          status: updated.status,
          sent_at: updated.sent_at,
        });
      };
      return request;
    });
    return updated;
  }
  await owner();
  const { error } = await supabase
    .from("projects")
    .update({ status: updated.status, sent_at: updated.sent_at })
    .eq("id", project.id);
  if (error) throw error;
  return updated;
}

export async function listSessions(): Promise<ClimbingSession[]> {
  if (!supabase) {
    const rows = await localRequest<ClimbingSession[]>("sessions", "readonly", (store) => store.getAll());
    return rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
  await owner();
  const { data, error } = await supabase.from("climbing_sessions").select("*").order("started_at", { ascending: false });
  if (error) throw error;
  return data as ClimbingSession[];
}

export async function startSession(gym: string): Promise<ClimbingSession> {
  const session: ClimbingSession = {
    id: crypto.randomUUID(),
    gym: gym.trim(),
    started_at: new Date().toISOString(),
    ended_at: null,
  };
  if (!supabase) {
    await localRequest("sessions", "readwrite", (store) => store.put(session));
    return session;
  }
  const userId = await owner();
  const { data, error } = await supabase
    .from("climbing_sessions")
    .insert({ ...session, user_id: userId })
    .select("id,gym,started_at,ended_at")
    .single();
  if (error) throw error;
  return data as ClimbingSession;
}

export async function endSession(session: ClimbingSession): Promise<ClimbingSession> {
  const ended = { ...session, ended_at: new Date().toISOString() };
  if (!supabase) {
    await localRequest("sessions", "readwrite", (store) => store.put(ended));
    return ended;
  }
  const { data, error } = await supabase
    .from("climbing_sessions")
    .update({ ended_at: ended.ended_at })
    .eq("id", session.id)
    .select("id,gym,started_at,ended_at")
    .single();
  if (error) throw error;
  return data as ClimbingSession;
}

export async function listAttempts(): Promise<Attempt[]> {
  if (!supabase) {
    const rows = await localRequest<Attempt[]>("attempts", "readonly", (store) => store.getAll());
    return rows
      .map((attempt) => ({ ...attempt, ended_hold_id: attempt.ended_hold_id || null, topped_out: Boolean(attempt.topped_out) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  await owner();
  const { data, error } = await supabase.from("attempts").select("id,project_id,session_id,result,ended_hold_id,topped_out,notes,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data as Attempt[];
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  if (!supabase) {
    await localRequest("attempts", "readwrite", (store) => store.put(attempt));
    return;
  }
  const userId = await owner();
  const { error } = await supabase.from("attempts").insert({ ...attempt, user_id: userId });
  if (error) throw error;
}
