import * as vscode from "vscode";
import { sectionsAt } from "./regions";

// Expand/Shrink Selection levels from the sections around each position (VS Code merges them with others)
export function registerSelection(ctx: vscode.ExtensionContext): void {
  const chain = (doc: vscode.TextDocument, pos: vscode.Position) => sectionsAt(doc, pos.line)
    .reduce<vscode.SelectionRange | undefined>((parent, s) => new vscode.SelectionRange(s.range, parent), undefined);
  const provider = { provideSelectionRanges: (doc: vscode.TextDocument, positions: vscode.Position[]) =>
    positions.map(pos => chain(doc, pos) ?? new vscode.SelectionRange(new vscode.Range(pos, pos))) };
  ctx.subscriptions.push(vscode.languages.registerSelectionRangeProvider("*", provider));
}
