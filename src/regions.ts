import * as vscode from "vscode";
import { minBy } from "./utils";

const HEADER_ICON    = vscode.SymbolKind.Enum;
const SUBHEADER_ICON = vscode.SymbolKind.EnumMember;
const REGION_ICON    = vscode.SymbolKind.Event;

type BlockKind = "header" | "subheader" | "region";
type Block     = [kind: BlockKind, name: string, start: number, end: number];

const PRIORITY: Record<BlockKind, number> = { header: 0, subheader: 1, region: 2 };


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

/* -------------------------------------------------------------------------- */
/*                                   Parser                                   */
/* -------------------------------------------------------------------------- */


export function parseBlocks(doc: vscode.TextDocument): Block[] {
  const blocks: Block[] = [];
  const stack: [BlockKind, string, number][] = [];
  const prefix  = commentPrefix(doc);
  const dash    = dividerRe(prefix);
  const region  = regionRe(prefix);

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
    if (region.end.test(text)) {
      const idx = stack.findLastIndex(([k]) => k === 'region');
      if (idx !== -1) blocks.push([...stack.splice(idx, 1)[0], i]);
      i++; continue;
    }

    // Region start
    const rm = region.start.exec(text);
    if (rm) {
      close('region', i);
      stack.push(['region', rm[1].trim() || 'Region', i]);
      i++; continue;
    }

    // 3-line header banner
    if (i + 2 < doc.lineCount) {
      const [l1, l2, l3] = [i, i+1, i+2].map(n => doc.lineAt(n).text);
      if (dash.test(l1) && dash.test(l3)) {
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

function makeContainer([kind, name, start, end]: Block): vscode.DocumentSymbol {
  const icon = kind === "header" ? HEADER_ICON : kind === "subheader" ? SUBHEADER_ICON : REGION_ICON;
  const range = new vscode.Range(start, 0, end, 999);
  return new vscode.DocumentSymbol(name, "", icon, range, new vscode.Range(start, 0, start, 0));
}


function assignToInnermost(items: vscode.DocumentSymbol[], pool: vscode.DocumentSymbol[]): Set<vscode.DocumentSymbol> {
  // Init claimed set and enclosure check function 
  const claimed = new Set<vscode.DocumentSymbol>();
  const encloses = (c: vscode.Range, i: vscode.Range) => i.start.line >= c.start.line && i.end.line <= c.end.line;

  for (const i of items) {
    // Find all containers that enclose this item, pick with the smallest range
    const enclosing = pool.filter(c => c !== i && encloses(c.range, i.range));
    const best = minBy(enclosing, c => c.range.end.line - c.range.start.line);
    
    // Assign
    if (best) {
      best.children.push(i);
      claimed.add(i);
    }
  }
  return claimed;
}


export function buildTree(symbols: vscode.DocumentSymbol[], doc: vscode.TextDocument): vscode.DocumentSymbol[] {
  const blocks = parseBlocks(doc);
  if (!blocks.length)
    return symbols;

  const containers = blocks.map(makeContainer);
  const claimedSymbols = assignToInnermost(symbols, containers);
  const claimedContainers = assignToInnermost(containers, containers);

  // Sort children within each container by line order
  for (const c of containers)
    c.children.sort((a, b) => a.range.start.line - b.range.start.line);

  return [
    ...containers.filter(c => !claimedContainers.has(c)),
    ...symbols.filter(s => !claimedSymbols.has(s)),
  ].sort((a, b) => a.range.start.line - b.range.start.line);
}