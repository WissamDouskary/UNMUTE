/// <reference types="vite/client" />

declare module 'd3-force-3d' {
  interface SimNode {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    index?: number;
  }
  interface Force {
    (alpha: number): void;
    initialize?: (nodes: SimNode[], ...args: unknown[]) => void;
  }
  export function forceCenter(x?: number, y?: number, z?: number): Force & {
    strength(value: number): this;
    x(value: number): this;
    y(value: number): this;
  };
  export function forceCollide<N extends SimNode>(
    radius?: number | ((node: N) => number),
  ): Force & {
    strength(value: number): this;
    iterations(value: number): this;
  };
}
