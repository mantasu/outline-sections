import * as vscode from "vscode";

const HEADER_ICON    = vscode.SymbolKind.Enum;
const SUBHEADER_ICON = vscode.SymbolKind.EnumMember;
const REGION_ICON    = vscode.SymbolKind.Event;

type BlockKind = "header" | "subheader" | "region";
type Block     = [kind: BlockKind, name: string, start: number, end: number];

const PRIORITY: Record<BlockKind, number> = { header: 0, subheader: 1, region: 2 };
const CONFIG_SECTION = "outlineSections";


/* -------------------------------------------------------------------------- */
/*                                  Patterns                                  */
/* -------------------------------------------------------------------------- */

const LANG_PREFIXES: [RegExp, string][] = [
  [/python|shell|toml|yaml|perl|ruby/i, '#'],
  [/sql/i,                              '--'],
  [/html|xml/i,                         '<!--'],
  [/css|java|[jt]sx?|c(pp)?|rust|go|swift/i, '/*'],
];

const REGION_KEYWORDS: Record<string, [string, string]> = {
  '#':   ['#\\s*region', '#\\s*endregion'],
  '--':  ['--\\s*region', '--\\s*endregion'],
  '<!--':['<!--\\s*region', '<!--\\s*endregion'],
  '/*':  ['(?:/\\*|//)\\s*region', '(?:/\\*|//)\\s*endregion'],
  '//':  ['//\\s*region', '//\\s*endregion'],
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
    end:   new RegExp(`^[ \\t]*${end}\\b`),
  };
}

function bannerTitle(line: string) {
  return line.replace(/^[\s/*#!\-<>]+/, '').replace(/[\s/*#!\-<>]+$/, '').trim();
}

function readCustomRegex(setting: string): RegExp | null {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(setting, "").trim();
  if (!raw) return null;

  try {
    return new RegExp(raw);
  } catch {
    return null;
  }
}

function matchesLine(regex: RegExp, line: string): RegExpExecArray | null {
  regex.lastIndex = 0;
  return regex.exec(line);
}

interface Patterns {
  dash: RegExp;
  region: { start: RegExp; end: RegExp };
  customStart: RegExp | null;
  customEnd: RegExp | null;
}

function getPatterns(doc: vscode.TextDocument): Patterns {
  const prefix = commentPrefix(doc);
  return {
    dash: dividerRe(prefix),
    region: regionRe(prefix),
    customStart: readCustomRegex("regionStartRegex"),
    customEnd: readCustomRegex("regionEndRegex"),
  };
}

// A 3-line banner's top and bottom lines must be *bare* dividers (no title of
// their own); otherwise a real 1-line banner ("# ---- Foo ----") that happens
// to sit a couple of lines above another divider would be misread as the top
// of an (empty) 3-line group and silently swallowed instead of being parsed
// as its own subheader.
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
      stack.push(['region', rm[1]?.trim() || 'Region', i]);
      i++; continue;
    }

    // 3-line header banner
    if (i + 2 < doc.lineCount) {
      const [l1, l2, l3] = [i, i+1, i+2].map(n => doc.lineAt(n).text);
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

type StackKind = BlockKind | "symbol";
type OpenBlock = {
  kind: StackKind;
  start: number;
  indent: number;
  node: vscode.DocumentSymbol;
  // Only meaningful for kind === "symbol": true if the symbol actually spans
  // a body of its own (more than just its declaration line). A one-liner like
  // `class Foo: pass` has no body for trailing content to belong to, so it
  // never protects anything written after it, no matter its indentation.
  protectsBody?: boolean;
};

// Real symbols rank below every comment section, so a comment section is
// never closed by a class/method arriving underneath it; it simply keeps
// adopting whatever comes next until something of equal-or-higher rank shows
// up.
const SYMBOL_PRIORITY = 3;
const rank = (kind: StackKind): number => (kind === "symbol" ? SYMBOL_PRIORITY : PRIORITY[kind]);

// Builds the merged outline for a single lexical scope: the top level of the
// document, or the body of one real symbol. Comment sections and real symbols
// are interleaved as they're encountered left-to-right, using one stack of
// currently "open" items:
//   - A real symbol is pushed onto the same stack as a lowest-priority open
//     item (after its own body has been recursed into independently). This
//     lets a comment section that's still open when the symbol is reached
//     adopt it as a child.
//   - Comment sections (header/subheader/region) close each other purely by
//     priority (header < subheader < region), regardless of indentation:
//     sibling banners at the same rank always end one another, and a weaker
//     rank can never close a stronger one. Indentation differences alone
//     never create nesting between two comment sections; only a real,
//     multi-line symbol's own body does that (see below), since scope
//     boundaries are already enforced by recursing into each real symbol's
//     own body independently.
//   - A real symbol with an actual body of its own (more than just its
//     declaration line) protects anything written after it that's still more
//     indented than its own declaration (e.g. a trailing banner glued to the
//     end of a class) - such content nests inside it instead of becoming a
//     sibling. A symbol with no body of its own (e.g. `class Foo: pass`)
//     offers no such protection: anything after it just closes it like a
//     comment would.
//   - Anything still open when the scope ends is closed at the scope's end
//     line, so a section can never leak past the real symbol (or document)
//     it was written inside.
function buildScope(
  doc: vscode.TextDocument,
  startLine: number,
  endLine: number,
  symbols: vscode.DocumentSymbol[],
  patterns: Patterns,
): vscode.DocumentSymbol[] {
  const roots: vscode.DocumentSymbol[] = [];
  const stack: OpenBlock[] = [];
  endLine = Math.min(endLine, doc.lineCount);

  const attach = (node: vscode.DocumentSymbol) => {
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
  };

  const closeOne = (open: OpenBlock, endAt: number) => {
    if (open.kind !== "symbol") open.node.range = new vscode.Range(open.start, 0, endAt, 999);
    attach(open.node);
  };

  // Pops every open item whose priority is >= `priority`, except that a
  // protecting symbol (one with its own body) blocks the pop - and anything
  // above it in the stack - as long as its declaration is more indented than
  // (i.e. shallower than) the new item, closing each popped item at `endAt`.
  const closeUpTo = (indent: number, priority: number, endAt: number) => {
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.kind === "symbol" && top.protectsBody && top.indent < indent) break;
      if (rank(top.kind) < priority) break;
      stack.pop();
      closeOne(top, endAt);
    }
  };

  // Closes the innermost open header/subheader (used when a blank banner is
  // meant to terminate the current section rather than open a new one), or
  // the innermost open region. Anything still open above that target (e.g. a
  // real symbol adopted as trailing content) is closed first, in order, so
  // it nests into the target rather than becoming an orphaned sibling.
  const closeThrough = (predicate: (b: OpenBlock) => boolean, endAt: number) => {
    const idx = stack.findLastIndex(predicate);
    if (idx === -1) return;
    while (stack.length > idx) closeOne(stack.pop()!, endAt);
  };

  const closeCurrent = (endAt: number) => closeThrough(b => b.kind === 'header' || b.kind === 'subheader', endAt);
  const closeRegion = (endAt: number) => closeThrough(b => b.kind === 'region', endAt);

  const sorted = [...symbols].sort((a, b) => a.range.start.line - b.range.start.line);
  let symIdx = 0;
  let i = startLine;

  while (i < endLine) {
    if (symIdx < sorted.length && sorted[symIdx].range.start.line <= i) {
      const sym = sorted[symIdx++];
      const symIndent = lineIndent(doc, sym.range.start.line);
      const protectsBody = sym.range.end.line - sym.range.start.line > 1;
      sym.children = buildScope(doc, sym.range.start.line, sym.range.end.line, sym.children, patterns);
      closeUpTo(symIndent, SYMBOL_PRIORITY, sym.range.start.line);
      stack.push({ kind: "symbol", start: sym.range.start.line, indent: symIndent, node: sym, protectsBody });
      i = Math.max(sym.range.end.line, i + 1);
      continue;
    }

    const text = doc.lineAt(i).text;
    const indent = lineIndent(doc, i);

    // Region end
    if (patterns.region.end.test(text) || !!(patterns.customEnd && matchesLine(patterns.customEnd, text))) {
      closeRegion(i);
      i++; continue;
    }

    // Region start
    const rm = patterns.region.start.exec(text) ?? (patterns.customStart ? matchesLine(patterns.customStart, text) : null);
    if (rm) {
      closeUpTo(indent, PRIORITY.region, i);
      stack.push({ kind: 'region', start: i, indent, node: makeContainer(rm[1]?.trim() || 'Region', 'region', i) });
      i++; continue;
    }

    // 3-line header banner (look ahead is bounded by the document, not the
    // local scope, so a banner glued to the very last line of an enclosing
    // symbol's reported range is still recognized).
    if (i + 2 < doc.lineCount) {
      const [l1, l2, l3] = [i, i + 1, i + 2].map(n => doc.lineAt(n).text);
      if (isBareDivider(patterns.dash, l1) && isBareDivider(patterns.dash, l3)) {
        const title = bannerTitle(l2);
        if (title && !/^[-\s]+$/.test(title)) {
          closeUpTo(indent, PRIORITY.header, i);
          stack.push({ kind: 'header', start: i, indent, node: makeContainer(title, 'header', i) });
        } else {
          closeCurrent(i);
        }
        i += 3; continue;
      }
    }

    // 1-line subheader banner
    if (patterns.dash.test(text)) {
      const title = bannerTitle(text);
      if (title && !/^[-\s]+$/.test(title)) {
        closeUpTo(indent, PRIORITY.subheader, i);
        stack.push({ kind: 'subheader', start: i, indent, node: makeContainer(title, 'subheader', i) });
      }
      i++; continue;
    }

    i++;
  }

  closeUpTo(-Infinity, -Infinity, endLine);
  return roots;
}

export function buildTree(symbols: vscode.DocumentSymbol[], doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  const patterns = getPatterns(doc);
  const roots = buildScope(doc, 0, doc.lineCount, symbols, patterns);
  for (const root of roots) sortTree(root);
  return roots;
}