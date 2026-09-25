export type Hold = {
  id: string;
  order_index: number;
  x: number;
  y: number;
  is_top: boolean;
};
export type Project = {
  id: string;
  name: string;
  grade: string;
  gym: string;
  photo_url: string;
  status: "active" | "sent" | "archived";
  created_at: string;
  sent_at: string | null;
  holds: Hold[];
  route_mode: "mapped" | "count_only";
  source_project_id: string | null;
  finish_type: "hold" | "top_out";
};

export type ClimbingSession = {
  id: string;
  gym: string;
  started_at: string;
  ended_at: string | null;
};

export type Attempt = {
  id: string;
  project_id: string;
  session_id: string;
  result: "attempt" | "sent";
  ended_hold_id: string | null;
  topped_out: boolean;
  notes: string;
  created_at: string;
};
