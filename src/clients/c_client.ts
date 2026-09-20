import * as vscode from "vscode";
import { BaseClient } from "./base_client";
import { toRange } from "../utils";


export class CClient extends BaseClient {
  static readonly LANGUAGES = ["c", "cpp", "cuda-cpp"];
  private origSendRequest: any

  static override toSymbol(r: any): vscode.DocumentSymbol {
    const sym = new vscode.DocumentSymbol(r.name, "", r.kind, toRange(r.range), toRange(r.selectionRange));
    sym.children = (r.children ?? []).map(BaseClient.toSymbol);
    return sym;
  }

  private async sendRequest(type: any, ...params: any[]) {
    // Get the request type and log if debugging is enabled
    const t = typeof type === "string" ? type : type?.method;
    if (this.debug) console.log(`[${this.constructor.name}] sendRequest`, t, params);

    // Suppress documentSymbol reqs, whitelist internal
    if (t === CClient.WHITELIST) return this.client._rpcClient.sendRequest("cpptools/getDocumentSymbols", ...params);
    if (t === "cpptools/getDocumentSymbols") return { symbols: [] };

    return this.origSendRequest(type, ...params);
  }

  protected override async getClient(): Promise<any> {
    // Get extension, original foreach, set helper done as tracker
    const ext = vscode.extensions.getExtension("ms-vscode.cpptools");
    const orig = Map.prototype.forEach;
    let done = false;

    if (!ext) return null;
    if (!ext.isActive) await ext.activate();

    // Walk the map to find a running language client
    const extractClient = (map: Map<any, any>) => {
      const entries = [...map.values()].map(c => c?.languageClient).filter(Boolean);
      return entries.find(c => c._rpcClient?._state === "running") ?? entries[0] ?? null;
    };

    function probe(resolve: (c: any) => void) {
      // Restore the original forEach and resolve the promise (bail out if the extension never iterates its map)
      const finish = (c: any) => { if (!done) { done = true; Map.prototype.forEach = orig; resolve(c); } };
      setTimeout(() => finish(null), 2000);

      // Intercept forEach to catch the moment the extension walks its client map
      Map.prototype.forEach = function (this: Map<any, any>, cb: any, thisArg?: any) {
        if (!done && this.values().next().value?.languageClient !== undefined) finish(extractClient(this));
        return orig.call(this, cb, thisArg);
      } as any;

      // Trigger the extension to iterate its map; it will throw, which is fine
      try { (ext!.exports as any).registerCustomConfigurationProvider({} as any); } catch {}
    }

    return new Promise(probe);
  }

  protected override async onClientReady(): Promise<void> {
    this.origSendRequest = this.client.sendRequest.bind(this.client);
    this.client.sendRequest = this.sendRequest.bind(this);
    await super.onClientReady();
  }

  override get isRunning(): boolean {
    return super.isRunning && this.client._rpcClient?._state === "running";
  }

  override async fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    const req = { uri: doc.uri.toString() };
    const raw = await this.client.sendRequest(CClient.WHITELIST, req) as any;
    const sym = (raw.symbols ?? []).map(CClient.toSymbol);
    return sym;
  }
}