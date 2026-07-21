import type { GraphSpec } from "./graphspec";
import { fromJson, toJson } from "./graphspec";

// User-saved builder templates, persisted in the browser only (localStorage). Nothing is sent
// to a server — same promise as everything else here. Accounts/teams sync is tracked as a
// separate issue; until then a template lives on the machine that made it.
export type UserTemplate = { name: string; spec: GraphSpec };

const KEY = "ab_user_templates";

// Pure core (testable without a DOM). Names are unique; upsert replaces a same-named template.
export function upsert(list: UserTemplate[], name: string, spec: GraphSpec): UserTemplate[] {
  const clean = name.trim();
  const without = list.filter((t) => t.name !== clean);
  return [...without, { name: clean, spec }].sort((a, b) => a.name.localeCompare(b.name));
}

export function remove(list: UserTemplate[], name: string): UserTemplate[] {
  return list.filter((t) => t.name !== name);
}

export function rename(list: UserTemplate[], from: string, to: string): UserTemplate[] {
  const clean = to.trim();
  if (!clean || from === clean || list.some((t) => t.name === clean)) return list; // no-op on collision
  return list.map((t) => (t.name === from ? { ...t, name: clean } : t)).sort((a, b) => a.name.localeCompare(b.name));
}

// localStorage wrappers. `toJson`/`fromJson` round-trip through the same validator-friendly
// serialization the rest of the builder uses, so a stored template is always a real spec.
export function loadUserTemplates(): UserTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as { name: string; spec: unknown }[];
    return raw.map((t) => ({ name: t.name, spec: fromJson(JSON.stringify(t.spec)) }));
  } catch {
    return [];
  }
}

function persist(list: UserTemplate[]): UserTemplate[] {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(list.map((t) => ({ name: t.name, spec: JSON.parse(toJson(t.spec)) }))));
  }
  return list;
}

export const saveUserTemplate = (name: string, spec: GraphSpec) =>
  persist(upsert(loadUserTemplates(), name, spec));
export const deleteUserTemplate = (name: string) => persist(remove(loadUserTemplates(), name));
export const renameUserTemplate = (from: string, to: string) =>
  persist(rename(loadUserTemplates(), from, to));
