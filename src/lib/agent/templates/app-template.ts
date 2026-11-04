/** Shared shape for the built-in demo apps used by the offline mock agent. */
import type { FileMap } from "@/types";

export interface AppTemplate {
  /** Short Chinese app name. */
  name: string;
  /** One Chinese sentence summary. */
  summary: string;
  /** 3-5 Chinese feature bullets. */
  features: string[];
  /** Complete self-contained static app files. */
  files: FileMap;
}
