import * as vscode from "vscode";

export type Kind = "header" | "subheader" | "region";
export type Part = "label" | "rule" | "delimiter" | "keyword";
export type Mark = { kind: Kind | "endregion"; part: Part; line: number; from: number; to: number };
type Marker = { kind: Kind | "endregion" | "close"; title: string; span: number };
type Found = Marker & { line: number; explicit?: boolean; pair?: number };
type Section = { kind: Kind; node: vscode.DocumentSymbol; explicit?: boolean };
type Patterns = Record<"comment" | "divider" | "edges" | "words" | "rule" | "token", RegExp>
  & Record<"starts" | "ends", RegExp[]>;
type Context = Patterns & { at: Map<number, Found> };

const ICON: Record<Kind, vscode.SymbolKind> = {
  header: vscode.SymbolKind.Enum,
  subheader: vscode.SymbolKind.EnumMember,
  region: vscode.SymbolKind.Event,
};
const RANK: Record<Kind, number> = { header: 0, subheader: 1, region: 2 };

// Section nodes of built outlines (with their kind), and each document's last outline
const SECTIONS = new WeakMap<vscode.DocumentSymbol, Kind>();
const TREES = new WeakMap<vscode.TextDocument, { version: number; roots: vscode.DocumentSymbol[] }>();


/* -------------------------------------------------------------------------- */
/*                                  Patterns                                  */
/* -------------------------------------------------------------------------- */

// Comment tokens per language id (unlisted ones get the default)
const C_STYLE = ["///", "//!", "//", "/**", "/*", "*/"];
const COMMENT_TOKENS: [RegExp, string[]][] = [
  [/^(python|yaml)$/, ["#"]],
  [/^(javascript|typescript)(react)?$/, C_STYLE], // no `#`: it starts private fields
  [/^(sql|lua|haskell|elm|ada|vhdl)$/, ["--", "/*", "*/"]],
  [/^(html|xml|xsl|markdown)$/, ["<!--", "-->"]], // no `#`/`//`: code blocks in docs aren't sections
  [/^(latex|tex|bibtex|matlab|erlang)$/, ["%"]],
  [/^(clojure|lisp|scheme|racket|ini)$/, [";", "#"]],
  [/^vb$/, ["'"]],
];
const DEFAULT_TOKENS = [...C_STYLE, "#"]; // `#` also catches `#region` and `#pragma region`

// Rules (like `----`) repeat one of these 4+ times
const RULE_CHARS = "-=*#~_.+<>/%;";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(source: string, flags?: string): RegExp | null {
  try { return new RegExp(source, flags); } catch { return null; }
}

function getPatterns(doc: vscode.TextDocument): Patterns {
  const config = vscode.workspace.getConfiguration("outlineSections", doc);
  const custom = (key: string) => config.get<string>(key, "").trim();
  const tokens = COMMENT_TOKENS.find(([re]) => re.test(doc.languageId))?.[1] ?? DEFAULT_TOKENS;
  const tok = `(?:${[...tokens].sort((a, b) => b.length - a.length).map(esc).join("|")})`; // longest first

  // Built-in rules and a user one (it must compile twice, as in `edges`)
  const rules = [...RULE_CHARS].map(c => `${esc(c)}{4,}`), user = custom("dividerRegex");
  if (user && compile(`(${user})|(${user})`)) rules.push(user);
  const rule = `(?:${rules.join("|")})`;

  // Users write only what follows the comment token; invalid patterns are skipped
  const region = (word: string, key: string) => [`#?\\s*(?:pragma\\s+)?${word}\\b`, custom(key)]
    .filter(Boolean)
    .map(s => compile(`^\\s*${tok}\\s*(?:${s})`))
    .filter((re): re is RegExp => !!re);

  return {
    comment: new RegExp(`^\\s*(?:${tok}${tokens.includes("/*") ? "|\\*" : ""})`),
    // A comment closed mid-line (webpack's `/******/ code`) isn't a divider
    divider: new RegExp(`^\\s*${tok}(?!.*(?:\\*/|-->)\\s*\\S)\\s*${rule}`),
    // Rules before tokens, so `#### Title` loses `####` rather than a single `#`
    edges: new RegExp(`^(?:${rule}|${tok})|(?:${rule}|${tok})$`, "g"),
    // Words of a marker line, and whether a word is a rule or a comment token (to style line parts)
    words: new RegExp(`${rule}|${tok}|\\S+`, "g"),
    rule: new RegExp(`^${rule}$`),
    token: new RegExp(`^${tok}$`),
    starts: region("region", "regionStartRegex"),
    ends: region("endregion", "regionEndRegex"),
  };
}


/* -------------------------------------------------------------------------- */
/*                                   Markers                                  */
/* -------------------------------------------------------------------------- */

// Peels comment tokens and rules off both ends of a line
function title(line: string, p: Patterns): string {
  let text = line.trim();
  for (let prev = ""; text !== prev;) [prev, text] = [text, text.replace(p.edges, "").trim()];
  return text;
}

// Titles need a letter or digit (ASCII art isn't a section)
const named = (title: string) => /[\p{L}\p{N}]/u.test(title);

// Region name: first matched group, else rest of the line
function regionName(m: RegExpExecArray, fallback = "Region"): string {
  const raw = m.slice(1).find(g => g !== undefined) ?? m.input.slice(m.index + m[0].length);
  return raw.replace(/\s*(?:\*\/|-->)\s*$/, "").trim() || fallback;
}

function classify(doc: vscode.TextDocument, i: number, p: Patterns): Marker | null {
  const line = (n: number) => (n < doc.lineCount ? doc.lineAt(n).text : "");
  const bare = (text: string) => p.divider.test(text) && !title(text, p);
  const text = line(i);

  const e = p.ends.map(re => re.exec(text)).find(Boolean);
  if (e) return { kind: "endregion", title: regionName(e, ""), span: 1 };
  const m = p.starts.map(re => re.exec(text)).find(Boolean);
  if (m) return { kind: "region", title: regionName(m), span: 1 };
  if (!p.divider.test(text)) return null;

  // A non-region comment between two bare rules is a header (or closes one if untitled)
  const mid = line(i + 1), marker = [...p.starts, ...p.ends].some(re => re.test(mid));
  if ((!mid.trim() || (p.comment.test(mid) && !marker)) && bare(text) && bare(line(i + 2))) {
    const t = title(mid, p);
    if (!t) return { kind: "close", title: "", span: 3 };
    if (named(t)) return { kind: "header", title: t, span: 3 };
  }

  const t = title(text, p);
  return named(t) ? { kind: "subheader", title: t, span: 1 } : null;
}

// Every marker in document order; ends pair with starts like brackets, making those regions explicit
function scan(doc: vscode.TextDocument, p: Patterns): Found[] {
  const found: Found[] = [], open: Found[] = [];
  for (let i = 0, m: Marker | null = null; i < doc.lineCount; i += m?.span ?? 1)
    if ((m = classify(doc, i, p))) found.push({ ...m, line: i });
  for (const m of found) {
    const start = m.kind === "endregion" ? open.pop() : undefined;
    if (m.kind === "region") open.push(m);
    if (start) [m.pair, start.explicit] = [start.line, true];
  }
  return found;
}

// Splits a marker line into its label, rules, comment delimiters and other words (keywords)
function lineParts(text: string, label: string, p: Patterns): [Part, number, number][] {
  const at = label ? text.lastIndexOf(label) : -1, end = at + label.length;
  const parts: [Part, number, number][] = at < 0 ? [] : [["label", at, end]];
  for (const { 0: word, index: i = 0 } of text.matchAll(p.words)) {
    const part: Part = p.rule.test(word) ? "rule" : p.token.test(word) ? "delimiter" : "keyword";
    if (at < 0 || i + word.length <= at || i >= end) parts.push([part, i, i + word.length]);
  }
  return parts;
}

// Styled parts of every marker line (region ends included); a banner's title is on its middle line
export function findMarks(doc: vscode.TextDocument): Mark[] {
  const p = getPatterns(doc);
  return scan(doc, p).filter(m => m.kind !== "close").flatMap(m => [...Array(m.span).keys()].flatMap(k =>
    lineParts(doc.lineAt(m.line + k).text, k === m.span >> 1 ? m.title : "", p)
      .map(([part, from, to]) => ({ kind: m.kind as Mark["kind"], part, line: m.line + k, from, to }))));
}


/* -------------------------------------------------------------------------- */
/*                                    Tree                                    */
/* -------------------------------------------------------------------------- */

// Body end of a symbol, stretched over deeper-indented trailing comments (e.g. banners)
function bodyEnd(doc: vscode.TextDocument, sym: vscode.DocumentSymbol, start: number, p: Patterns): number {
  const indentOf = (text: string) => text.length - text.trimStart().length;
  const col = sym.range.start.line === start ? sym.range.start.character : 0;
  const indent = Math.max(indentOf(doc.lineAt(start).text), col);
  let end = sym.range.end.line - (sym.range.end.character === 0 ? 1 : 0);

  for (let k = end + 1; k < doc.lineCount; k++) {
    const text = doc.lineAt(k).text;
    if (!text.trim()) continue;
    if (indentOf(text) <= indent || !p.comment.test(text)) break; // deeper code is its own symbol
    end = k;
  }
  return end;
}

// Outline of one scope: sections nest by rank, symbols attach to the innermost and recurse
function buildScope(doc: vscode.TextDocument, from: number, to: number, symbols: vscode.DocumentSymbol[], ctx: Context) {
  const roots: vscode.DocumentSymbol[] = [];
  const stack: Section[] = [];
  const attach = (node: vscode.DocumentSymbol) => (stack.at(-1)?.node.children ?? roots).push(node);

  // Closes stack[idx] and everything opened after it (no-op for -1)
  const closeFrom = (idx: number, end: number) => {
    while (idx >= 0 && stack.length > idx) {
      const { node } = stack.pop()!;
      node.range = new vscode.Range(node.range.start.line, 0, end, 999);
      attach(node);
    }
  };

  // Anchor on names (jdt.ls stretches `range` back over leading comments)
  const startOf = (s: vscode.DocumentSymbol) => Math.max(s.range.start.line, s.selectionRange.start.line);
  const queue = [...symbols].sort((a, b) => startOf(a) - startOf(b));
  to = Math.min(to, doc.lineCount - 1);

  for (let i = from, k = 0; ;) {
    if (k < queue.length && startOf(queue[k]) <= i) {
      const sym = queue[k++];
      const start = startOf(sym);
      const end = bodyEnd(doc, sym, start, ctx);
      sym.children = buildScope(doc, start, end, sym.children, ctx);
      attach(sym);
      // Already consumed symbols (`self.x`) mustn't skip lines
      i = Math.max(end + 1, start < i ? i : i + 1);
    } else if (i <= to) {
      // Sections opened inside an explicit region (one with an end marker) stay in it until its end
      const m = ctx.at.get(i), base = stack.findLastIndex(s => s.explicit) + 1;
      if (m?.kind === "endregion") closeFrom(stack.findIndex(s => s.node.range.start.line === m.pair), i);
      else if (m?.kind === "close") closeFrom(stack.findLastIndex((s, j) => j >= base && s.kind !== "region"), i);
      else if (m) {
        const kind = m.kind as Kind;
        closeFrom(stack.findIndex((s, j) => j >= base && RANK[s.kind] >= RANK[kind]), i);
        const node = new vscode.DocumentSymbol(m.title, "", ICON[kind], new vscode.Range(i, 0, i, 999), new vscode.Range(i, 0, i, 0));
        stack.push({ kind, node, explicit: m.explicit });
        SECTIONS.set(node, kind);
      }
      i += m?.span ?? 1;
    } else break;
  }

  closeFrom(0, to);
  return roots;
}

export function buildTree(symbols: vscode.DocumentSymbol[], doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  const p = getPatterns(doc), at = new Map(scan(doc, p).map(m => [m.line, m]));
  const roots = buildScope(doc, 0, doc.lineCount - 1, symbols, { ...p, at });
  TREES.set(doc, { version: doc.version, roots });
  return roots;
}

// Sections around a line, outermost first, from the last outline if the document hasn't changed since
export function sectionsAt(doc: vscode.TextDocument, line: number): { kind: Kind; range: vscode.Range }[] {
  const tree = TREES.get(doc), found: { kind: Kind; range: vscode.Range }[] = [];
  let nodes = tree && tree.version === doc.version ? tree.roots : buildTree([], doc), n: vscode.DocumentSymbol | undefined;

  // Follow the last node containing the line on each level (siblings only touch at boundary lines)
  while ((n = nodes.filter(n => n.range.start.line <= line && line <= n.range.end.line).at(-1))) {
    const kind = SECTIONS.get(n), end = n.range.end.line;
    if (kind) found.push({ kind, range: new vscode.Range(n.range.start.line, 0, end, doc.lineAt(end).text.length) });
    nodes = n.children;
  }
  return found;
}
