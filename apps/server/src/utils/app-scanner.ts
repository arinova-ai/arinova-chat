// Static analysis scanner for marketplace app packages
// Detects forbidden API usage in JavaScript/TypeScript files

const FORBIDDEN_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /\beval\s*\(/, description: "eval() is not allowed" },
  { pattern: /\bnew\s+Function\s*\(/, description: "new Function() is not allowed" },
  { pattern: /\bimport\s*\(/, description: "Dynamic import() is not allowed" },
  { pattern: /\bdocument\.cookie\b/, description: "document.cookie access is not allowed" },
  { pattern: /\btop\.location\b/, description: "top.location access is not allowed" },
  { pattern: /\bparent\.location\b/, description: "parent.location access is not allowed" },
  { pattern: /\bwindow\.open\s*\(/, description: "window.open() is not allowed" },
  { pattern: /\bsetTimeout\s*\(\s*["'`]/, description: "setTimeout with string argument is not allowed" },
  { pattern: /\bsetInterval\s*\(\s*["'`]/, description: "setInterval with string argument is not allowed" },
];

export interface ScanViolation {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export interface ScanResult {
  passed: boolean;
  violations: ScanViolation[];
}

/** Scan a single file's content for forbidden patterns */
export function scanFileContent(fileName: string, content: string): ScanViolation[] {
  const violations: ScanViolation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: fileName,
          line: i + 1,
          pattern: description,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }

  return violations;
}

/** Check if a file should be scanned (JS/TS files only) */
export function isScannable(fileName: string): boolean {
  return /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(fileName);
}
