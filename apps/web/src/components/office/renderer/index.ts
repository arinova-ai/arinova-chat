import { IframeRenderer } from "./iframe-renderer";
import type { OfficeRenderer } from "./types";

export type { OfficeRenderer };

export function createRenderer(): OfficeRenderer {
  return new IframeRenderer();
}
