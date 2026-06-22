import * as vscode from "vscode";
import { PythonClient } from "./clients/py_client";
import { RustClient } from "./clients/rs_client";
import { CClient } from "./clients/c_client";
import { TypeScriptClient } from "./clients/ts_client";
import { buildTree } from "./regions";


const CLIENTS = [PythonClient, RustClient, CClient, TypeScriptClient];


/* -------------------------------------------------------------------------- */
/*                                   Clients                                  */
/* -------------------------------------------------------------------------- */

export async function refreshSymbols(lang: string): Promise<void> {
  const docs = vscode.workspace.textDocuments.filter(d => d.languageId === lang);

  for (const doc of docs) {
    const wasDirty = doc.isDirty;
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: false });

    await editor.edit(editBuilder => {
      editBuilder.insert(new vscode.Position(0, 0), ' ');
    }, { undoStopBefore: false, undoStopAfter: false });

    await editor.edit(editBuilder => {
      editBuilder.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)));
    }, { undoStopBefore: false, undoStopAfter: false });

    if (!wasDirty) await doc.save();
  }
}


export async function getClient(clients: Map<string, any>, lang: string): Promise<any> {
    // Resolve client for curr lang
    let client = clients.get(lang);
    if (client?.isRunning) return client;

    // If no running client, find class and create new client instance
    const ClientClass = CLIENTS.find(c => c.LANGUAGES.includes(lang));
    client = ClientClass ? await ClientClass.create() : null;
    if (!client?.isRunning) return null;

    // Store and refresh symbols
    clients.set(lang, client);
    await refreshSymbols(lang);
    
    return client;
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
  for (const lang of CLIENTS.flatMap(client => client.LANGUAGES)) {
    // VSCode DocumentSymbol provider that resolves client and builds merged symbol tree
    const provider = { provideDocumentSymbols: (doc: vscode.TextDocument) => provideSymbols(clients, doc) };
    ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: lang }, provider, { label }));
  }
}


/* -------------------------------------------------------------------------- */
/*                                 Activation                                 */
/* -------------------------------------------------------------------------- */

export function activate(ctx: vscode.ExtensionContext): void {
  // Setup clients and register providers
  const label = "Comment Sections";
  const clients = new Map<string, any>();
  registerProviders(ctx, clients, label);
}

export function deactivate(): void {}