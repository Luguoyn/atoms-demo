/** IndexedDB persistence helpers (browser only). OWNER: Lead. */
"use client";

import { get, set } from "idb-keyval";
import type { Project } from "@/types";

const PROJECTS_KEY = "atoms-demo:projects:v1";
const SETTINGS_KEY = "atoms-demo:provider-settings:v1";

export async function loadProjects(): Promise<Project[]> {
  try {
    const value = await get<Project[]>(PROJECTS_KEY);
    if (!Array.isArray(value)) return [];
    return value.filter((p) => p && typeof p.id === "string");
  } catch {
    return [];
  }
}

export async function persistProjects(projects: Project[]): Promise<void> {
  try {
    await set(PROJECTS_KEY, projects);
  } catch {
    /* storage quota / private mode — non-fatal */
  }
}

export async function loadSettings<T>(): Promise<T | null> {
  try {
    return (await get<T>(SETTINGS_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function persistSettings<T>(settings: T): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
  } catch {
    /* non-fatal */
  }
}
