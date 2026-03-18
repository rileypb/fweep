declare module 'jest-axe' {
  export interface AxeViolation {
    readonly id: string;
    readonly impact?: string | null;
    readonly help: string;
    readonly description: string;
  }

  export interface AxeRunResult {
    readonly violations: readonly AxeViolation[];
  }

  export type Axe = (
    element?: HTMLElement | SVGElement | null,
    options?: unknown,
  ) => Promise<AxeRunResult>;

  const jestAxe: {
    readonly axe: Axe;
    readonly toHaveNoViolations: unknown;
  };

  export default jestAxe;
}
