import { Session } from "inspector";
import { promisify } from "util";
import * as vscode from "vscode";
import { toRange } from "../utils";


export abstract class BaseClient {
  // Constants
  static readonly LANGUAGES: string[];
  static readonly WHITELIST = "whitelist";

  // Attributes
  protected client: any = null;
  protected debug = false;

  static async create(this: new () => BaseClient): Promise<BaseClient> {
    // Async constructor
    const client = new this();
    await client.setupClient();
    return client;
  }

  static toSymbol(r: any): vscode.DocumentSymbol {
    const sym = new vscode.DocumentSymbol(r.name, "", r.kind - 1, toRange(r.range), toRange(r.selectionRange));
    sym.children = (r.children ?? []).map(BaseClient.toSymbol);
    return sym;
  }

  protected async setupClient(): Promise<void> {
    // Acquire client and call the hook
    this.client = await this.getClient();
    if (this.debug) console.log(`[${this.constructor.name}] Acquired client:\n`, this.client);
    if (this.client) await this.onClientReady();
  }

  protected async scan(fn: any, probe: string): Promise<any> {
    // To walk V8 remote trees
    const g = globalThis as any;
    const s = new Session();
    s.connect();
    const post = promisify(s.post.bind(s)) as (m: string, p?: any) => Promise<any>;
    const kids = async (id: string) => (await post("Runtime.getProperties", { objectId: id }))?.result ?? [];
    const has = (x: any) => x.value?.objectId;
    g.__fn = fn;

    try {
      // Find closure scopes of `fn` via CDP
      await post("Runtime.enable");
      const { result } = await post("Runtime.evaluate", { expression: "globalThis.__fn" });
      const info = await post("Runtime.getProperties", { objectId: result.objectId });
      const scopes = info.internalProperties?.find((p: any) => p.name === "[[Scopes]]")?.value?.objectId;

      // Flatten every non-global closure scope, then try `probe` on each var until one exposes the client
      const o = (scopes ? await kids(scopes) : []).filter((x: any) => has(x) && x.value.description !== "Global");
      const v = (await Promise.all(o.map((x: any) => kids(x.value.objectId)))).flat().filter(has);

      for (const x of v as any[]) {
        // Try `probe` on this candidate; stop as soon as one exposes the client
        const args = { objectId: x.value.objectId, functionDeclaration: probe, awaitPromise: true };
        await post("Runtime.callFunctionOn", args).catch(() => {});
        if (g.__cli) return g.__cli;
      }
      return null;
    } catch {
      return null;
    } finally {
      delete g.__fn;
      delete g.__cli;
      s.disconnect();
    }
  }

  get isRunning(): boolean { return !!this.client; }

  // Child methods to implement
  protected async onClientReady(): Promise<void> { }
  protected abstract getClient(): Promise<any>;
  abstract fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]>;
}