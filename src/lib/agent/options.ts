/** Options for a single agent run (route + tests). */
export interface RunAgentOptions {
  /** Aborted when the HTTP client disconnects. */
  signal?: AbortSignal;
  /** Test hook: force the deterministic offline mock agent even with an API key. */
  forceMock?: boolean;
  /** Multiplier for mock staged delays; `0` runs instantly (smoke tests). */
  mockDelayScale?: number;
  /** Injectable clock, mainly for tests. */
  now?: () => number;
}
