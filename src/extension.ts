import * as vscode from "vscode";
import { PythonClient, BasedPyrightClient } from "./clients/py_client";
import { RustClient } from "./clients/rs_client";
import { CClient, ClangdClient } from "./clients/c_client";
import { TypeScriptClient } from "./clients/ts_client";
import { JavaClient } from "./clients/java_client";
import { GoClient } from "./clients/go_client";
import { buildTree } from "./regions";
import { registerDecorations } from "./decorations";
import { registerSelection } from "./selection";


// First running client of a language wins (opt-in analysers go before the defaults)
const CLIENTS = [BasedPyrightClient, PythonClient, RustClient, ClangdClient, CClient, TypeScriptClient, JavaClient, GoClient];


/* -------------------------------------------------------------------------- */
/*                                   Clients                                  */
/* -------------------------------------------------------------------------- */

export async function refreshSymbols(lang: string): Promise<void> {
  const prev: Promise<void> = (refreshSymbols as any)._chain ?? Promise.resolve();

  const run = prev.then(async () => {
    const docs = vscode.workspace.textDocuments.filter(d => d.languageId === lang);

    for (const doc of docs) {
      const wasDirty = doc.isDirty;
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: false });

      await editor.edit(e => e.insert(new vscode.Position(0, 0), ' '),
        { undoStopBefore: false, undoStopAfter: false });
      await editor.edit(e => e.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))),
        { undoStopBefore: false, undoStopAfter: false });

      if (!wasDirty) await vscode.commands.executeCommand("workbench.action.files.revert");
    }
  });

  (refreshSymbols as any)._chain = run.catch(() => {});
  return run;
}


export async function getClient(clients: Map<string, any>, lang: string): Promise<any> {
    // Resolve client for curr lang
    let client = clients.get(lang);
    if (client?.isRunning) return client;

    // If no running client, create one per class of the lang until one runs
    for (const ClientClass of CLIENTS.filter(c => c.LANGUAGES.includes(lang)))
      if ((client = await ClientClass.create().catch(() => null))?.isRunning) break;
    clients.set(lang, client ?? null);

    // Refresh and return client
    if (client?.isRunning) {
      await refreshSymbols(lang);
      return client;
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/*                                  Provider                                  */
/* -------------------------------------------------------------------------- */

export async function provideSymbols(clients: Map<string, any>, doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
  // Resolve client for current language
  const client = await getClient(clients, doc.languageId);
  if (!client) return buildTree([], doc);

  // Fetch document symbols and build merged tree
  const symbols = await client.fetchSymbols(doc);
  const tree = buildTree(symbols, doc);

  if (client.debug) {
    console.log(`\n[${client.constructor.name}] Symbols for ${doc.fileName}:`);
    console.log(symbols, "\nMerged tree:\n", tree);
  }

  return tree;
}

function registerProviders(ctx: vscode.ExtensionContext, clients: Map<string, any>, label: string): void {
  // One provider for all languages (sections merge into analyser symbols if supported)
  const provider = { provideDocumentSymbols: (doc: vscode.TextDocument) => provideSymbols(clients, doc) };
  ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider("*", provider, { label }));
}


/* -------------------------------------------------------------------------- */
/*                                 Activation                                 */
/* -------------------------------------------------------------------------- */

export function activate(ctx: vscode.ExtensionContext): void {
  // Setup clients and register the outline, highlighting and selection providers
  const label = "Comment Sections";
  const clients = new Map<string, any>();
  registerProviders(ctx, clients, label);
  registerDecorations(ctx);
  registerSelection(ctx);
}

export function deactivate(): void {}