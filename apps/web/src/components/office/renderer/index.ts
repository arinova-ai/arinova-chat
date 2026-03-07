import { PixiRenderer } from "./pixi-renderer";
import { SpriteRenderer } from "./sprite-renderer";
import { ThreeJSRenderer } from "./threejs-renderer";
import type { OfficeRenderer } from "./types";
import type { RendererType } from "../theme-types";

export type { OfficeRenderer, RendererType };

export function createRenderer(type: RendererType): OfficeRenderer {
  switch (type) {
    case "threejs":
      return new ThreeJSRenderer();
    case "sprite":
      return new SpriteRenderer();
    case "pixi":
    default:
      return new PixiRenderer();
  }
}
