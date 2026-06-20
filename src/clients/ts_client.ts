import { Session } from "inspector";
import { promisify } from "util";
import * as vscode from "vscode";
import { BaseClient } from "./base_client";
import { toRange, navKindToSymbolKind } from "../utils";


export class TypeScriptClient extends BaseClient {
  static readonly LANGUAGES = ["typescript", "javascript", "typescriptreact", "javascriptreact"];
  private origExecute: any;


  protected static convertNavTree(items: any[]): vscode.DocumentSymbol[] {
    return items.flatMap(item => {
        const span = item.spans?.[0];
        if (!span) return [];

        const range = toRange(span);
        const symbol = new vscode.DocumentSymbol(
            item.text ?? "",
            item.kindModifiers ?? "",
            navKindToSymbolKind(item.kind),
            range,
            range,
        );

        symbol.children = TypeScriptClient.convertNavTree(item.childItems ?? []);
        return [symbol];
      });
    }

  private async execute(command: string, args: any, token: any, config?: any) {
    if (this.debug) console.log(`[${this.constructor.name}] execute`, command, JSON.stringify(args));
    
    if (command === TypeScriptClient.WHITELIST) return this.origExecute("navtree", args, token, config);
    if (command === "navtree") return { type: "response", body: { childItems: [] } };
    
    return this.origExecute(command, args, token, config);
  };

  protected override async getClient(): Promise<any> {
    // Get the typescript analyser extension (vscode internal) and await activation
    const ext = vscode.extensions.getExtension("vscode.typescript-language-features");
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();

    // Only thing we can get at this point is plugin manager
    const pm = ext.exports?.getAPI(0)?._pluginManager;
    if (!pm) return null;
    (globalThis as any).__pm = pm;
    
    // PM prototype finder
    const findProto = `(() => {
      let p = Object.getPrototypeOf(globalThis.__pm);
      while (p && Object.getPrototypeOf(p) !== Object.prototype) p = Object.getPrototypeOf(p);
      return p;
    })()`;
    
    // Find client that has the PM
    const scanForClient = `function() {
      const pred = o => o.pluginManager === globalThis.__pm && 'bufferSyncSupport' in o && 'diagnosticsManager' in o
      globalThis.__client = this.find(o => { try { return pred(o); } catch { return false; } });
      return !!globalThis.__client;
    }`;
  
    async function probe(resolve: (v: any) => void) {
      // Setup Runtime session
      const g = globalThis as any;
      const s = new Session();
      s.connect();
      const post = promisify(s.post.bind(s)) as (method: string, params?: any) => Promise<any>;
  
      try {
        await post("Runtime.enable");
        
        // Find prototype of PM
        const { result } = await post("Runtime.evaluate", { expression: findProto, objectGroup: "probe" });
        if (!result?.objectId) return resolve(null);
        
        // Find all instances of PM
        const { objects } = await post("Runtime.queryObjects", { prototypeObjectId: result.objectId });
        if (!objects?.objectId) return resolve(null);
        
        // Scan for client
        const callArgs = { objectId: objects.objectId, functionDeclaration: scanForClient, returnByValue: true }
        await post("Runtime.callFunctionOn", callArgs);
        resolve(g.__client ?? null);
      } catch {
        resolve(null);
      } finally {
        // Cleanup
        delete g.__pm;
        delete g.__client;
        await post("Runtime.releaseObjectGroup", { objectGroup: "probe" }).catch(() => {});
        s.disconnect();
      }
    }

    return new Promise(probe);
  }

  protected override async onClientReady(): Promise<void> {
    this.origExecute = this.client.execute.bind(this.client);
    this.client.execute = this.execute.bind(this);
    await super.onClientReady();
  }

  override async fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    const req = { file: doc.uri.fsPath }
    const raw = await this.client.execute(TypeScriptClient.WHITELIST, req, new vscode.CancellationTokenSource().token);
    const sym = TypeScriptClient.convertNavTree(raw?.body?.childItems ?? []);
    return sym;
  }
}