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