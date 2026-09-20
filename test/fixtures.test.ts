import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { vi, describe, test, expect, beforeEach } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { buildTree, parseBlocks } from '../src/regions';

// Data-driven: every key in expected.yaml is `<stem>_<lang>`, paired with the
// source file `<stem>.<lang-ext>`. The symbols a language server would report
// are recovered from the expected tree by dropping the comment sections (whose
// names parseBlocks finds as banners in the source) and locating every
// remaining name in document order, so a new case is added just by dropping in
// a fixture and an expected entry.
type ExpectedNode = string | Record<string, ExpectedNode[]>;

const resources = path.join(__dirname, 'resources');
const expected = yaml.load(fs.readFileSync(path.join(resources, 'expected.yaml'), 'utf8')) as Record<string, ExpectedNode[]>;

const LANGS: Record<string, { id: string; ext: string; brace: boolean }> = {
  py: { id: 'python', ext: 'py', brace: false },
  ts: { id: 'typescript', ext: 'ts', brace: true },
  rs: { id: 'rust', ext: 'rs', brace: true },
  cpp: { id: 'cpp', ext: 'cpp', brace: true },
  java: { id: 'java', ext: 'java', brace: true },
};

const loadDoc = (languageId: string, lines: string[]) => ({
  languageId,
  lineCount: lines.length,
  lineAt: (index: number) => ({ text: lines[index] }),
  getText: () => lines.join('\n'),
}) as unknown as vscode.TextDocument;

const toExpected = (nodes: vscode.DocumentSymbol[]): ExpectedNode[] =>
  nodes.map(n => (n.children.length ? { [n.name]: toExpected(n.children) } : n.name));

const indentOf = (line: string) => line.length - line.trimStart().length;
const isCommentLine = (line: string) => /^\s*(#|\/\/|\/\*|\*)/.test(line);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds the next line (at or after `from`, in document order) that declares
// `name` in code, so duplicate names across scopes resolve to distinct lines.
const findDecl = (lines: string[], name: string, from: number) => {
  const re = new RegExp(`\\b${escapeRe(name)}\\b`);
  for (let i = from; i < lines.length; i++)
    if (lines[i].trim() && !isCommentLine(lines[i]) && re.test(lines[i])) return i;
  throw new Error(`declaration not found: ${name}`);
};

// A Python def/class spans its (possibly wrapped) signature up to the `:` plus
// every following code line indented deeper than it; blank and comment lines
// are skipped so a shallow trailing banner never cuts the body short.
const pyRange = (lines: string[], i: number): [number, number] => {
  const d = indentOf(lines[i]);
  let depth = 0, head = i;
  for (let k = i; k < lines.length; k++) {
    for (const ch of lines[k]) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (depth <= 0 && lines[k].includes(':')) { head = k; break; }
  }
  let end = head;
  for (let j = head + 1; j < lines.length; j++) {
    if (!lines[j].trim() || isCommentLine(lines[j])) continue;
    if (indentOf(lines[j]) > d) end = j; else break;
  }
  return [i, end];
};

// A brace symbol ends where the braces opened at/after its declaration balance.
const braceRange = (lines: string[], i: number): [number, number] => {
  let depth = 0, seen = false;
  for (let k = i; k < lines.length; k++) {
    if (isCommentLine(lines[k])) continue;
    for (const ch of lines[k]) {
      if (ch === '{') { depth++; seen = true; }
      else if (ch === '}') depth--;
    }
    if (seen && depth <= 0) return [i, k];
  }
  return [i, i];
};

const sym = (name: string, start: number, end: number, children: vscode.DocumentSymbol[]): vscode.DocumentSymbol => {
  const s = new vscode.DocumentSymbol(
    name, '', vscode.SymbolKind.Function,
    new vscode.Range(start, 0, end, 999),
    new vscode.Range(start, 0, start, 0),
  );
  s.children = children;
  return s;
};

// Rebuilds the language-server symbol tree from the expected outline: comment
// sections are dropped (their symbol descendants rise to the nearest symbol
// ancestor) and each surviving name is resolved, in document order, to a
// source range. `cursor` advances monotonically so repeated names (e.g. two
// `__init__`) map to their own declaration.
const deriveSymbols = (
  nodes: ExpectedNode[],
  lines: string[],
  brace: boolean,
  isComment: (name: string) => boolean,
  cursor: { line: number },
): vscode.DocumentSymbol[] => {
  const out: vscode.DocumentSymbol[] = [];
  for (const node of nodes) {
    const name = typeof node === 'string' ? node : Object.keys(node)[0];
    const kids = typeof node === 'string' ? [] : (node[name] ?? []);
    if (isComment(name)) {
      out.push(...deriveSymbols(kids, lines, brace, isComment, cursor));
      continue;
    }
    const decl = findDecl(lines, name, cursor.line);
    cursor.line = decl;
    const [start, end] = brace ? braceRange(lines, decl) : pyRange(lines, decl);
    const childSyms = deriveSymbols(kids, lines, brace, isComment, cursor);
    out.push(sym(name, start, end, childSyms));
  }
  return out;
};

describe('outline fixtures', () => {
  beforeEach(() => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    });
  });

  for (const key of Object.keys(expected)) {
    const lang = LANGS[key.slice(key.lastIndexOf('_') + 1)];
    const stem = key.slice(0, key.lastIndexOf('_'));
    test(key, () => {
      const lines = fs.readFileSync(path.join(resources, `${stem}.${lang.ext}`), 'utf8').split('\n');
      const doc = loadDoc(lang.id, lines);
      const bannerNames = new Set(parseBlocks(doc).map(b => b[1]));
      const isComment = (name: string) => bannerNames.has(name);
      const symbols = deriveSymbols(expected[key], lines, lang.brace, isComment, { line: 0 });
      expect(toExpected(buildTree(symbols, doc))).toEqual(expected[key]);
    });
  }
});
