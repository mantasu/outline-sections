import * as vscode from "vscode";

export type Kind = "header" | "subheader" | "region";
type Section = { kind: Kind; node: vscode.DocumentSymbol };
type Marker = { kind: Kind | "endregion" | "close"; title: string; span: number };
type Patterns = { comment: RegExp; divider: RegExp; edges: RegExp; starts: RegExp[]; ends: RegExp[] };

const ICON: Record<Kind, vscode.SymbolKind> = {
  header: vscode.SymbolKind.Enum,
  subheader: vscode.SymbolKind.EnumMember,
  region: vscode.SymbolKind.Event,
};
const RANK: Record<Kind, number> = { header: 0, subheader: 1, region: 2 };


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
function regionName(m: RegExpExecArray): string {
  const raw = m.slice(1).find(g => g !== undefined) ?? m.input.slice(m.index + m[0].length);
  return raw.replace(/\s*(?:\*\/|-->)\s*$/, "").trim() || "Region";
}

function classify(doc: vscode.TextDocument, i: number, p: Patterns): Marker | null {
  const line = (n: number) => (n < doc.lineCount ? doc.lineAt(n).text : "");
  const bare = (text: string) => p.divider.test(text) && !title(text, p);
  const text = line(i);

  if (p.ends.some(re => re.test(text))) return { kind: "endregion", title: "", span: 1 };
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
function buildScope(doc: vscode.TextDocument, from: number, to: number, symbols: vscode.DocumentSymbol[], p: Patterns) {
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
      const end = bodyEnd(doc, sym, start, p);
      sym.children = buildScope(doc, start, end, sym.children, p);
      attach(sym);
      // Already consumed symbols (`self.x`) mustn't skip lines
      i = Math.max(end + 1, start < i ? i : i + 1);
    } else if (i <= to) {
      const m = classify(doc, i, p);
      if (m?.kind === "endregion") closeFrom(stack.findIndex(s => s.kind === "region"), i);
      else if (m?.kind === "close") closeFrom(stack.findLastIndex(s => s.kind !== "region"), i);
      else if (m) {
        const kind = m.kind as Kind;
        closeFrom(stack.findIndex(s => RANK[s.kind] >= RANK[kind]), i);
        const node = new vscode.DocumentSymbol(m.title, "", ICON[kind], new vscode.Range(i, 0, i, 999), new vscode.Range(i, 0, i, 0));
        stack.push({ kind, node });
      }
      i += m?.span ?? 1;
    } else break;
  }

  closeFrom(0, to);
  return roots;
}

export function buildTree(symbols: vscode.DocumentSymbol[], doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  return buildScope(doc, 0, doc.lineCount - 1, symbols, getPatterns(doc));
}

// Section markers (region ends count as regions) with the lines they span, for decorations
export function findMarkers(doc: vscode.TextDocument): { kind: Kind; line: number; span: number }[] {
  const p = getPatterns(doc), markers: { kind: Kind; line: number; span: number }[] = [];
  for (let i = 0, m: Marker | null = null; i < doc.lineCount; i += m?.span ?? 1)
    if ((m = classify(doc, i, p)) && m.kind !== "close")
      markers.push({ kind: (m.kind === "endregion" ? "region" : m.kind) as Kind, line: i, span: m.span });
  return markers;
}
