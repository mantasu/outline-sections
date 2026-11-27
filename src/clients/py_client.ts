import * as path from "path";
import * as vscode from "vscode";
import { BaseClient } from "./base_client";
import { AsyncLocalStorage } from "async_hooks";


export class PythonClient extends BaseClient {
  static readonly LANGUAGES = ["python"];
  private static readonly symbolCallStore = new AsyncLocalStorage<boolean>();
  private origSendRequest: any;

  
  private async sendRequest(type: any, ...params: any[]) {
    // Get the request type and log if debugging is enabled
    const t = typeof type === "string" ? type : type?.method;
    const r = () => this.origSendRequest("textDocument/documentSymbol", ...params);
    if (this.debug) console.log(`[${this.constructor.name}] sendRequest`, t, params);

    // Suppress documentSymbol reqs, whitelist internal
    if (t === PythonClient.WHITELIST) return PythonClient.symbolCallStore.run(true, r);
    if (t === "textDocument/documentSymbol" && !PythonClient.symbolCallStore.getStore()) return [];

    return this.origSendRequest(type, ...params);
  }

  protected override async getClient(): Promise<any> {
    const ext = vscode.extensions.getExtension("ms-python.vscode-pylance");
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();
    // await api._manager.startClient()
    return ext.exports.client.getClient() ?? null;
  }

  protected override async onClientReady(): Promise<void> {
    // Wait up to 10s for a still starting client (e.g. clangd doesn't await its start)
    if (this.client.state === 3) await new Promise(r => (this.client.onDidChangeState(r), setTimeout(r, 1e4)));
    this.origSendRequest = this.client.sendRequest.bind(this.client);
    this.client.sendRequest = this.sendRequest.bind(this);
    await super.onClientReady();
  }

  override get isRunning(): boolean {
    return super.isRunning && this.client?._state === "running";
  }

  override async fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    const req = { textDocument: { uri: doc.uri.toString() } };
    const raw = await this.client.sendRequest(PythonClient.WHITELIST, req) as any;
    const sym = (raw ?? []).map(PythonClient.toSymbol);
    return sym;
  }
}


export class BasedPyrightClient extends PythonClient {
  static readonly LANGUAGES = ["python"];
  protected readonly ids = ["detachhead.basedpyright", "anysphere.cursorpyright", "ms-pyright.pyright"];
  protected readonly probe: string = "function(){if(this.clientOptions) globalThis.__cli=this}";

  protected override async getClient(): Promise<any> {
    // Get the first installed analyser extension and await its activation
    const ext = this.ids.map(id => vscode.extensions.getExtension(id)).find(Boolean);
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();

    // The client is module state, so scan the closure of the module's `deactivate`
    const main = require.cache[require.resolve(path.join(ext.extensionPath, ext.packageJSON.main))];
    return this.scan(main?.exports.deactivate, this.probe);
  }
}