import * as vscode from "vscode";

const HEADER_ICON = vscode.SymbolKind.Enum;
const SUBHEADER_ICON = vscode.SymbolKind.EnumMember;
const REGION_ICON = vscode.SymbolKind.Event;

type BlockKind = "header" | "subheader" | "region";
type Block = [kind: BlockKind, name: string, start: number, end: number];

const PRIORITY: Record<BlockKind, number> = { header: 0, subheader: 1, region: 2 };
const CONFIG_SECTION = "outlineSections";


/* -------------------------------------------------------------------------- */
/*                                  Patterns                                  */
/* -------------------------------------------------------------------------- */

const LANG_PREFIXES: [RegExp, string][] = [
  [/python|shell|toml|yaml|perl|ruby/i, '#'],
  [/sql/i, '--'],
  [/html|xml/i, '<!--'],
  [/css|java|[jt]sx?|c(pp)?|rust|go|swift/i, '/*'],
];

const REGION_KEYWORDS: Record<string, [string, string]> = {
  '#': ['#\\s*region', '#\\s*endregion'],
  '--': ['--\\s*region', '--\\s*endregion'],
  '<!--': ['<!--\\s*region', '<!--\\s*endregion'],
  '/*': ['(?:/\\*|//)\\s*#?\\s*region', '(?:/\\*|//)\\s*#?\\s*endregion'],
  '//': ['//\\s*#?\\s*region', '//\\s*#?\\s*endregion'],
};

// Comment-marker fragment per prefix so a custom region pattern only needs the
// token after the marker; the anchor, marker, and spacing are added for it.
const COMMENT_MARKERS: Record<string, string> = {
  '#': '#',
  '--': '--',
  '<!--': '<!--',
  '/*': '(?:/\\*|//)',
  '//': '(?:/\\*|//)',
};

function commentPrefix(doc: vscode.TextDocument): string {
  const byLang = LANG_PREFIXES.find(([re]) => re.test(doc.languageId))?.[1];
  if (byLang) return byLang;
  const sample = doc.getText().split('\n').find(l => l.trim()) ?? '';
  return ['#', '--', '/*', '//'].find(p => sample.trimStart().startsWith(p)) ?? '#';
}

function dividerRe(prefix: string) {
  const e = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[ \\t]*${e}[ \\t]*-{4,}`);
}

function regionRe(prefix: string) {
  // c8 ignore next 1
  const [start, end] = REGION_KEYWORDS[prefix] ?? REGION_KEYWORDS['#'];
  return {
    start: new RegExp(`^[ \\t]*${start}\\b(.*)`),
    end: new RegExp(`^[ \\t]*${end}\\b`),
  };
}

function bannerTitle(line: string) {
  return line.replace(/^[\s/*#!\-<>]+/, '').replace(/[\s/*#!\-<>]+$/, '').trim();
}

export function regionName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s*(?:\*\/|-->)\s*$/, '').trim() || 'Region';
}

export function readCustomRegex(setting: string, prefix: string): RegExp | null {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(setting, "").trim();
  if (!raw) return null;

  // Users write only the token; prepend the anchor and the language's comment marker.
  const marker = COMMENT_MARKERS[prefix] ?? COMMENT_MARKERS['#'];
  try {
    return new RegExp(`^[ \\t]*${marker}\\s*${raw}`);
  } catch {
    return null;
  }
}

function matchesLine(regex: RegExp, line: string): RegExpExecArray | null {
  regex.lastIndex = 0;
  return regex.exec(line);
}

// A line is a comment when it opens with the language's comment marker (the
// block/line variants for brace languages), so scope extension can tell a
// trailing banner apart from real code.
function isCommentLine(prefix: string, line: string): boolean {
  const t = line.trimStart();
  // c8 ignore next 1 -- callers skip blank lines, so an empty trim never occurs
  if (!t) return false;
  if (prefix === '/*') return t.startsWith('/*') || t.startsWith('//') || t.startsWith('*');
  return t.startsWith(prefix);
}

interface Patterns {
  prefix: string;
  dash: RegExp;
  region: { start: RegExp; end: RegExp };
  customStart: RegExp | null;
  customEnd: RegExp | null;
}

function getPatterns(doc: vscode.TextDocument): Patterns {
  const prefix = commentPrefix(doc);
  return {
    prefix,
    dash: dividerRe(prefix),
    region: regionRe(prefix),
    customStart: readCustomRegex("regionStartRegex", prefix),
    customEnd: readCustomRegex("regionEndRegex", prefix),
  };
}

// A 3-line banner's top and bottom lines must be *bare* dividers (no title),
// so a real 1-line banner isn't misread as the top of an empty 3-line group.
function isBareDivider(dash: RegExp, line: string): boolean {
  return dash.test(line) && !bannerTitle(line);
}

/* -------------------------------------------------------------------------- */
/*                                   Parser                                   */
/* -------------------------------------------------------------------------- */


export function parseBlocks(doc: vscode.TextDocument): Block[] {
  const blocks: Block[] = [];
  const stack: [BlockKind, string, number][] = [];
  const { dash, region, customStart, customEnd } = getPatterns(doc);

  const close = (kind: BlockKind, line: number) => {
    while (stack.length && PRIORITY[stack.at(-1)![0]] >= PRIORITY[kind])
      blocks.push([...stack.pop()!, line]);
  };

  const closeCurrent = (line: number) => {
    const idx = stack.findLastIndex(([k]) => k === 'header' || k === 'subheader');
    if (idx !== -1) blocks.push([...stack.splice(idx, 1)[0], line]);
  };

  let i = 0;
  while (i < doc.lineCount) {
    const text = doc.lineAt(i).text;

    // Region end
    if (region.end.test(text) || !!(customEnd && matchesLine(customEnd, text))) {
      const idx = stack.findLastIndex(([k]) => k === 'region');
      if (idx !== -1) blocks.push([...stack.splice(idx, 1)[0], i]);
      i++; continue;
    }

    // Region start
    const rm = region.start.exec(text) ?? (customStart ? matchesLine(customStart, text) : null);
    if (rm) {
      close('region', i);
      stack.push(['region', regionName(rm[1]), i]);
      i++; continue;
    }

    // 3-line header banner
    if (i + 2 < doc.lineCount) {
      const [l1, l2, l3] = [i, i + 1, i + 2].map(n => doc.lineAt(n).text);
      if (isBareDivider(dash, l1) && isBareDivider(dash, l3)) {
        const title = bannerTitle(l2);
        if (title && !/^[-\s]+$/.test(title)) {
          close('header', i);
          stack.push(['header', title, i]);
        } else {
          closeCurrent(i);
        }
        i += 3; continue;
      }
    }

    // 1-line subheader banner
    if (dash.test(text)) {
      const title = bannerTitle(text);
      if (title && !/^[-\s]+$/.test(title)) {
        close('subheader', i);
        stack.push(['subheader', title, i]);
      }
      i++; continue;
    }

    i++;
  }

  while (stack.length) blocks.push([...stack.pop()!, doc.lineCount - 1]);
  return blocks.sort((a, b) => a[2] - b[2]);
}

/* -------------------------------------------------------------------------- */
/*                                    Tree                                    */
/* -------------------------------------------------------------------------- */

function makeContainer(name: string, kind: BlockKind, start: number): vscode.DocumentSymbol {
  const icon = kind === "header" ? HEADER_ICON : kind === "subheader" ? SUBHEADER_ICON : REGION_ICON;
  const range = new vscode.Range(start, 0, start, 999); // end is filled in once the block closes
  return new vscode.DocumentSymbol(name, "", icon, range, new vscode.Range(start, 0, start, 0));
}

function sortTree(node: vscode.DocumentSymbol): void {
  node.children.sort((a, b) => a.range.start.line - b.range.start.line);
  for (const child of node.children) sortTree(child);
}

function lineIndent(doc: vscode.TextDocument, line: number): number {
  const text = doc.lineAt(line).text;
  return text.length - text.trimStart().length;
}

type OpenBlock = {
  kind: BlockKind;
  start: number;
  node: vscode.DocumentSymbol;
};

const rank = (kind: BlockKind): number => PRIORITY[kind];

// Trailing *comment* lines indented deeper than a symbol's own declaration
// belong to that symbol (a banner written there would nest inside it), so the
// symbol's scope is stretched to swallow them before it is recursed into. Only
// comments are pulled in — deeper code marks a sibling/nested symbol the
// language server reports separately, and must not be absorbed.
function extendEnd(doc: vscode.TextDocument, natEnd: number, symIndent: number, prefix: string): number {
  let end = natEnd;
  for (let k = natEnd + 1; k < doc.lineCount; k++) {
    const text = doc.lineAt(k).text;
    if (!text.trim()) continue;
    if (lineIndent(doc, k) <= symIndent) break;
    if (!isCommentLine(prefix, text)) break;
    end = k;
  }
  return end;
}

// Builds the merged outline for one lexical scope (the document or a symbol
// body). Comment sections form the skeleton and nest purely by priority
// (header < subheader < region); each real symbol attaches under the innermost
// open section (or the scope root) and recurses into its own extended body.
// Anything still open at the scope end is closed there so it can't leak out.
function buildScope(
  doc: vscode.TextDocument,
  startLine: number,
  endLine: number,
  symbols: vscode.DocumentSymbol[],
  patterns: Patterns,
): vscode.DocumentSymbol[] {
  const roots: vscode.DocumentSymbol[] = [];
  const stack: OpenBlock[] = [];
  endLine = Math.min(endLine, doc.lineCount - 1);

  const attach = (node: vscode.DocumentSymbol) => {
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
  };

  const closeOne = (open: OpenBlock, endAt: number) => {
    open.node.range = new vscode.Range(open.start, 0, endAt, 999);
    attach(open.node);
  };

  const closeSections = (priority: number, endAt: number) => {
    while (stack.length && rank(stack[stack.length - 1].kind) >= priority)
      closeOne(stack.pop()!, endAt);
  };

  const closeAll = (endAt: number) => {
    while (stack.length) closeOne(stack.pop()!, endAt);
  };

  // Closes the innermost matching section, first closing anything above it so
  // the target closes cleanly instead of orphaning what it contained.
  const closeThrough = (predicate: (b: OpenBlock) => boolean, endAt: number) => {
    const idx = stack.findLastIndex(predicate);
    if (idx === -1) return;
    while (stack.length > idx) closeOne(stack.pop()!, endAt);
  };

  const closeCurrent = (endAt: number) => closeThrough(b => b.kind === 'header' || b.kind === 'subheader', endAt);
  const closeRegion = (endAt: number) => closeThrough(b => b.kind === 'region', endAt);

  const openSection = (kind: BlockKind, title: string, at: number) => {
    closeSections(rank(kind), at);
    stack.push({ kind, start: at, node: makeContainer(title, kind, at) });
  };

  // Some servers (e.g. jdt.ls) stretch a symbol's `range` back over its leading
  // comments; anchor on the name (`selectionRange`) so preceding banners stay in
  // the outer scope instead of nesting inside the symbol.
  const startOf = (s: vscode.DocumentSymbol) => Math.max(s.range.start.line, s.selectionRange.start.line);
  const sorted = [...symbols].sort((a, b) => startOf(a) - startOf(b));
  let symIdx = 0;
  let i = startLine;

  while (i <= endLine || symIdx < sorted.length) {
    if (symIdx < sorted.length && startOf(sorted[symIdx]) <= i) {
      const sym = sorted[symIdx++];
      const symStart = startOf(sym);
      const symIndent = lineIndent(doc, symStart);
      // A range end at column 0 stops before that line (exclusive); a wider end
      // includes its own line.
      const natEnd = sym.range.end.character === 0 ? sym.range.end.line - 1 : sym.range.end.line;
      const bodyEnd = extendEnd(doc, natEnd, symIndent, patterns.prefix);
      sym.children = buildScope(doc, symStart, bodyEnd, sym.children, patterns);
      attach(sym);
      i = Math.max(bodyEnd + 1, i + 1);
      continue;
    }

    if (i > endLine) break;

    const text = doc.lineAt(i).text;

    // Region end
    if (patterns.region.end.test(text) || !!(patterns.customEnd && matchesLine(patterns.customEnd, text))) {
      closeRegion(i);
      i++; continue;
    }

    // Region start
    const rm = patterns.region.start.exec(text) ?? (patterns.customStart ? matchesLine(patterns.customStart, text) : null);
    if (rm) {
      openSection('region', rm[1]?.trim() || 'Region', i);
      i++; continue;
    }

    // 3-line header banner (look-ahead is bounded by the document, not the
    // local scope, so a banner on the last line of a symbol's range still counts).
    if (i + 2 < doc.lineCount) {
      const [l1, l2, l3] = [i, i + 1, i + 2].map(n => doc.lineAt(n).text);
      if (isBareDivider(patterns.dash, l1) && isBareDivider(patterns.dash, l3)) {
        const title = bannerTitle(l2);
        if (title && !/^[-\s]+$/.test(title)) openSection('header', title, i);
        else closeCurrent(i);
        i += 3; continue;
      }
    }

    // 1-line subheader banner
    if (patterns.dash.test(text)) {
      const title = bannerTitle(text);
      if (title && !/^[-\s]+$/.test(title)) openSection('subheader', title, i);
      i++; continue;
    }

    i++;
  }

  closeAll(endLine);
  return roots;
}

export function buildTree(symbols: vscode.DocumentSymbol[], doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  const patterns = getPatterns(doc);
  const roots = buildScope(doc, 0, doc.lineCount - 1, symbols, patterns);
  for (const root of roots) sortTree(root);
  return roots;
}