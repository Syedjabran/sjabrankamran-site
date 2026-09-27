// Types for engine.mjs (the Practical Lab's server-side physics engine).

export type Control =
  | { key: string; type: "range"; label: string; value: number; min: number; max: number; step: number }
  | { key: string; type: "select"; label: string; value: string; options: { value: string; label: string }[] };

export type Settings = Record<string, number | string>;

export type LabState = {
  active: boolean;
  closed: boolean;
  t: number;
  run: number;
  history: { t: number; settings: Settings }[] | null;
};

export type Timing = {
  timed: boolean;
  fps: number;
  chunkSeconds: number;
  maxSeconds: number;
  meterSeconds: number | null;
};

export type PublicView = Record<string, number | string | boolean>;
export type Readings = Record<string, number>;

export type EncodedFrames = {
  count: number;
  constant: Record<string, number | string | boolean | null>;
  series: Record<string, number[]>;
  steps: Record<string, [number, number | string | boolean | null][]>;
};

export type TrackChunk = {
  chunk: number;
  fps: number;
  first: number;
  frames: EncodedFrames;
  meters: { every: number; readings: [number, Readings | null][] } | null;
  done: boolean;
};

type Request = {
  id: string;
  params: Record<string, number>;
  attemptKey: Buffer | string;
  settings: Settings;
};

export const FAMILIES: readonly string[];
export const EXPERIMENT_IDS: readonly string[];
export const STATIC_SPRING_ROD_TRUTH: Readonly<Record<string, number>>;
export class LabInputError extends Error {}
export function timingOf(family: string): Timing;
export function publicView(view: Record<string, unknown>): PublicView;
export function experimentOf(id: unknown): { id: string; family: string; controls: Control[] } | null;
export function defaultSettings(id: string): Settings;
export function normaliseSettings(id: string, raw: unknown): Settings;
export function normaliseState(id: string, raw?: unknown): LabState;
export function streamKey(attemptKey: Buffer | string, purpose: string): number;
export function viewAt(request: Request & { state?: LabState }): PublicView;
export function sampleAt(request: Request & { state?: LabState }): Readings;
export function encodeFrames(frames: PublicView[]): EncodedFrames;
export function trackChunk(request: Request & { state?: Pick<LabState, "run" | "history">; chunk?: number }): TrackChunk;
