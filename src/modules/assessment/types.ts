// Shared contract for assessment modules (docs/SCHEMA.md: Finding). Keep this file small and stable.
export type Category = 'security' | 'dependencies' | 'runtime' | 'architecture' | 'standards' | 'cloud';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  id: string; // stable kebab-case rule id, e.g. "node-runtime-eol"
  category: Category;
  severity: Severity;
  title: string; // one line, plain words
  evidence?: string; // short: file, line or value that triggered the rule (never secrets)
  recommendation: string; // one actionable sentence
}

export interface DepRef {
  name: string;
  version: string; // exact when taken from a lockfile, otherwise the lowest version the range allows
  dev: boolean;
  approximate: boolean; // true when the version was derived from a range
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
