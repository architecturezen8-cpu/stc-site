/**
 * v2.8.84.0 — shared shape for the Admin Studio's form-activity feed
 * (owner item 6). ONE type file so the API route and the feed component
 * never drift apart.
 */

export type FormActivityKind = "grade-6" | "alevel" | "appointment" | "contact";

export type FormActivityItem = {
  kind: FormActivityKind;
  id: number;
  reference: string;
  name: string;
  detail: string;
  status: string;
  createdAt: string;
  /** Still on its INITIAL status → the office has not acted on it yet. */
  fresh: boolean;
};

export type FormActivityResponse = {
  items: FormActivityItem[];
  awaiting: { admissions: number; appointments: number; contacts: number };
};
