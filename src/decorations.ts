import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { findMarks, sectionsAt, Mark, Part } from "./regions";

type Kind = Mark["kind"];
type Rule = { classes: string[]; decls: string[][] };
const KINDS: Kind[] = ["header", "subheader", "region", "endregion"];
const PARTS: (Part | "scope")[] = ["label", "rule", "delimiter", "keyword", "scope"];
const NAMES: string[] = [...KINDS, ...PARTS];


// A built-in profile's stylesheet from `profiles/<name>.css` (`custom` has none, only the user's CSS applies)
function readProfile(name: string): string {
  const file = path.join(__dirname, "..", "profiles", `${name}.css`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

// Rules of a stylesheet, whose classes name a section kind and/or a part, e.g. `.endregion .keyword { ... }`
function parseCss(css: string): Rule[] {
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const declarations = (body: string) => body.split(";").map(d => d.split(":"))
    .filter(([k, ...v]) => k.trim() && v.length).map(([k, ...v]) => [k.trim(), v.join(":").trim()]);
  return blocks.flatMap(([, selectors, body]) => selectors.split(",")
    .map(selector => [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]))
    .filter(classes => classes.every(c => NAMES.includes(c))) // unknown classes match nothing
    .map(classes => ({ classes, decls: declarations(body) })));
}

// A kind's part: matching rules by specificity then order (`unset` clears); the scope takes only explicit rules
function resolve(rules: Rule[], kind: Kind, part: string): Map<string, string> {
  const matches = (r: Rule) => r.classes.every(c => c === kind || c === part);
  const allowed = (r: Rule, k: string) => part !== "scope" || r.classes.includes(part) || k.startsWith("--");
  const pairs = rules.filter(matches).sort((a, b) => a.classes.length - b.classes.length)
    .flatMap(r => r.decls.filter(([k]) => allowed(r, k)));
  const decls = new Map<string, string>();
  for (const [k, v] of pairs)
    if (k === "all" && v === "unset") decls.clear(); else if (v === "unset") decls.delete(k); else decls.set(k, v);
  return decls;
}

// Decoration options: properties become camel-cased, `var(--color)` the kind's `--color` (else its theme colour)
function toOptions(rules: Rule[], kind: Kind, part: string): vscode.DecorationRenderOptions {
  const decls = resolve(rules, kind, part), id = `outlineSections.${kind}Foreground`, own = decls.get("--color");
  const color = own ?? `var(--vscode-${id.replace(".", "-")})`, theme = new vscode.ThemeColor(id);
  const value = (v: string) => (v === "var(--color)" && !own ? theme : v.replaceAll("var(--color)", color));
  const camel = (k: string) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const options = [...decls].filter(([k]) => !k.startsWith("--")).map(([k, v]) => [camel(k), value(v)]);
  return { ...Object.fromEntries(options), isWholeLine: part === "scope" };
}

export function registerDecorations(ctx: vscode.ExtensionContext): void {
  let styles = new Map<string, vscode.TextEditorDecorationType>(), timer: NodeJS.Timeout | undefined;
  const dispose = () => styles.forEach(style => style.dispose());
  const set = (ed: vscode.TextEditor, key: string, ranges: vscode.Range[]) =>
    styles.has(key) && ed.setDecorations(styles.get(key)!, ranges);

  // Tints the innermost section around the cursor (styles are keyed "kind.part")
  const scope = (editor: vscode.TextEditor) => {
    if (!KINDS.some(kind => styles.has(`${kind}.scope`))) return;
    const section = sectionsAt(editor.document, editor.selection.active.line).at(-1);
    KINDS.forEach(kind => set(editor, `${kind}.scope`, section?.kind === kind ? [section.range] : []));
  };

  // Restyles the parts of every marker line, then the section around the cursor
  const apply = (editor: vscode.TextEditor) => {
    const ranges = new Map([...styles.keys()].filter(k => !k.endsWith(".scope")).map(k => [k, [] as vscode.Range[]]));
    for (const m of findMarks(editor.document))
      ranges.get(`${m.kind}.${m.part}`)?.push(new vscode.Range(m.line, m.from, m.line, m.to));
    ranges.forEach((list, key) => set(editor, key, list));
    scope(editor);
  };
  const applyAll = () => styles.size && vscode.window.visibleTextEditors.forEach(apply);

  // Rebuilds the styles from the profile's CSS plus the user's (disposing old ones clears them)
  const reload = () => {
    dispose();
    const config = vscode.workspace.getConfiguration("outlineSections.highlight");
    const profile = config.get<string>("profile", "classic");
    const user = [config.get<string | string[]>("css", [])].flat().join("\n");
    const rules = parseCss(profile === "none" ? "" : readProfile(profile) + user);
    const options = KINDS.flatMap(kind => PARTS.map(part => [`${kind}.${part}`, toOptions(rules, kind, part)] as const));
    styles = new Map(options.filter(([, o]) => Object.keys(o).length > 1)
      .map(([k, o]) => [k, vscode.window.createTextEditorDecorationType(o)]));
    applyAll();
  };

  ctx.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(applyAll),
    vscode.window.onDidChangeTextEditorSelection(e => scope(e.textEditor)),
    vscode.workspace.onDidChangeTextDocument(() => { clearTimeout(timer); timer = setTimeout(applyAll, 300); }),
    vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration("outlineSections") && reload()),
    { dispose },
  );
  reload();
}
