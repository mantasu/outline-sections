import * as vscode from "vscode";
import { findMarkers, Kind } from "./regions";

// Gutter icons are images, so they can't use theme colours (these match the dark defaults)
const GUTTER: Record<Kind, string> = { header: "#A7D685", subheader: "#80BC6B", region: "#62A76E" };


function createStyle(kind: Kind, enabled: string[]): vscode.TextEditorDecorationType {
  const color = new vscode.ThemeColor(`outlineSections.${kind}Foreground`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="3" height="16" fill="${GUTTER[kind]}"/></svg>`;
  const icon = vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);

  return vscode.window.createTextEditorDecorationType({
    ...(enabled.includes("color") ? { color, fontWeight: "bold", fontStyle: "italic" } : {}),
    ...(enabled.includes("scrollbar") ? { overviewRulerColor: color, overviewRulerLane: vscode.OverviewRulerLane.Left } : {}),
    ...(enabled.includes("gutter") ? { gutterIconPath: icon, gutterIconSize: "contain" } : {}),
  });
}

export function registerDecorations(ctx: vscode.ExtensionContext): void {
  let enabled: string[] = [], styles: [Kind, vscode.TextEditorDecorationType][] = [], timer: NodeJS.Timeout | undefined;
  const dispose = () => styles.forEach(([, style]) => style.dispose());

  // Restyle every visible editor: each kind gets the full lines of its markers
  const apply = () => enabled.length && vscode.window.visibleTextEditors.forEach(editor => {
    const doc = editor.document, markers = findMarkers(doc);
    for (const [kind, style] of styles) editor.setDecorations(style, markers.filter(m => m.kind === kind)
      .map(m => new vscode.Range(m.line, 0, m.line + m.span - 1, doc.lineAt(m.line + m.span - 1).text.length)));
  });

  // Rebuild the styles from settings (disposing the old ones clears their decorations)
  const reload = () => {
    dispose();
    const config = vscode.workspace.getConfiguration("outlineSections.highlight");
    enabled = ["color", "scrollbar", "gutter"].filter(option => config.get<boolean>(option));
    styles = (["header", "subheader", "region"] as Kind[]).map(kind => [kind, createStyle(kind, enabled)]);
    apply();
  };

  ctx.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(apply),
    vscode.workspace.onDidChangeTextDocument(() => { clearTimeout(timer); timer = setTimeout(apply, 300); }),
    vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration("outlineSections") && reload()),
    { dispose },
  );
  reload();
}
