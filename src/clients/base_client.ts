import * as vscode from "vscode";
import { toRange } from "../utils";


export abstract class BaseClient {
  // Constants
  static readonly LANGUAGES: string[];
  static readonly WHITELIST = "whitelist";

  // Attributes
  protected client: any = null;
  protected debug = true;

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

  get isRunning(): boolean { return !!this.client; }

  // Child methods to implement
  protected async onClientReady(): Promise<void> { }
  protected abstract getClient(): Promise<any>;
  abstract fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]>;
}