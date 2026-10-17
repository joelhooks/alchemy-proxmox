// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/constraints.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import type { PveForm } from "./resource.ts";
export interface ParamConstraint {
  readonly type?: string;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly patternFlags?: string;
  readonly patternSource?: string;
  readonly format?: string;
  readonly default?: string;
  readonly each?: true;
}
export type EndpointConstraints = Readonly<Record<string, ParamConstraint>>;
export type EndpointKey = string;
export interface ViolationOptions {
  readonly presence?: boolean;
}
const lengthOf = (value: string): number => [...value].length;
const checkValue = (
  name: string,
  value: string,
  rule: ParamConstraint,
): string[] => {
  const out: string[] = [];
  if (rule.maxLength !== undefined && lengthOf(value) > rule.maxLength) {
    out.push(`${name}: at most ${rule.maxLength} characters`);
  }
  if (rule.minLength !== undefined && lengthOf(value) < rule.minLength) {
    out.push(`${name}: at least ${rule.minLength} characters`);
  }
  if (rule.enum !== undefined && !rule.enum.includes(value)) {
    out.push(`${name}: must be one of ${rule.enum.join(", ")}`);
  }
  if (
    rule.pattern !== undefined &&
    !new RegExp(rule.pattern, rule.patternFlags).test(value)
  ) {
    out.push(`${name}: must match ${rule.patternSource ?? rule.pattern}`);
  }
  const numeric = Number(value);
  const bounded = rule.minimum !== undefined || rule.maximum !== undefined;
  if (bounded && value !== "" && Number.isFinite(numeric)) {
    if (rule.minimum !== undefined && numeric < rule.minimum) {
      out.push(`${name}: at least ${rule.minimum}`);
    }
    if (rule.maximum !== undefined && numeric > rule.maximum) {
      out.push(`${name}: at most ${rule.maximum}`);
    }
  }
  return out;
};
export const violations = (
  table: EndpointConstraints,
  form: PveForm,
  options: ViolationOptions = {},
): readonly string[] => {
  const out: string[] = [];
  for (const [name, rule] of Object.entries(table)) {
    const value = form[name];
    if (value === undefined) {
      if (options.presence === true && rule.required === true)
        out.push(`${name}: required`);
      continue;
    }
    for (const item of typeof value === "string" ? [value] : value) {
      out.push(...checkValue(name, item, rule));
    }
  }
  return out;
};
export const refusal = (
  endpoint: EndpointKey,
  found: readonly string[],
): string =>
  `${endpoint} would be rejected by the vendor:\n  - ${found.join("\n  - ")}\n` +
  "These are the vendor's own limits, read from its published schema " +
  "(packages/alchemy/src/proxmox/generated/constraints). Fix the declaration.";
