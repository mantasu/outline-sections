import { vi } from 'vitest';
import * as vscode from 'vscode';
import { buildTree } from '../src/regions';

type Section = [kind: string, name: string, start: number, end: number];

const KINDS: Record<number, string> = {
  [vscode.SymbolKind.Enum]: 'header',
  [vscode.SymbolKind.EnumMember]: 'subheader',
  [vscode.SymbolKind.Event]: 'region',
};

export const makeDoc = (languageId: string, lines: string[]) => ({
  languageId,
  lineCount: lines.length,
  lineAt: (index: number) => ({ text: lines[index] }),
  getText: () => lines.join('\n'),
}) as unknown as vscode.TextDocument;

// Sets the extension settings returned by `getConfiguration` (unset keys fall back to defaults)
export const mockSettings = (settings: Record<string, unknown> = {}) =>
  (vscode.workspace.getConfiguration as any).mockReturnValue({
    get: vi.fn((key: string, defaultValue?: unknown) => settings[key] ?? defaultValue),
  });

// Comment sections found in a document (no language-server symbols), flattened
// in document order as [kind, name, startLine, endLine]
export const sections = (doc: vscode.TextDocument): Section[] => {
  const out: Section[] = [];
  const walk = (nodes: vscode.DocumentSymbol[]): void => nodes.forEach(n => {
    if (KINDS[n.kind]) out.push([KINDS[n.kind], n.name, n.range.start.line, n.range.end.line]);
    walk(n.children);
  });
  walk(buildTree([], doc));
  return out;
};
