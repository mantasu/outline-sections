import { Session } from "inspector";
import { promisify } from "util";
import * as vscode from "vscode";
import { BaseClient } from "./base_client";


export class JavaClient extends BaseClient {
    static readonly LANGUAGES = ["java"];
    private origSendRequest: any;

    private async sendRequest(type: any, ...params: any[]) {
        const t = typeof type === "string" ? type : type?.method;
        if (this.debug) console.log(`[${this.constructor.name}] sendRequest`, t, params);

        // Route our internal request to the real one, suppress the server's own outline
        if (t === JavaClient.WHITELIST) return this.origSendRequest("textDocument/documentSymbol", ...params);
        if (t === "textDocument/documentSymbol") return [];

        return this.origSendRequest(type, ...params);
    }

    protected override async getClient(): Promise<any> {
        // Get the analyser extension and await JDT LS is running
        const ext = vscode.extensions.getExtension("redhat.java");
        if (!ext) return null;
        if (!ext.isActive) await ext.activate();
        await ext.exports.serverRunning?.();

        // To walk V8 remote trees
        const g = globalThis as any;
        const s = new Session();
        s.connect();
        const post = promisify(s.post.bind(s)) as (m: string, p?: any) => Promise<any>;
        const kids = async (id: string) => (await post("Runtime.getProperties", { objectId: id }))?.result ?? [];
        const has = (x: any) => x.value?.objectId;

        // Set exposed `getActiveLanguageClient`
        g.__gds = ext.exports.getDocumentSymbols;
        const f = "async function(){const c=this.getActiveLanguageClient; if(c) globalThis.__cli=await c.call(this)}";

        try {
            // Find closure scopes via CDP
            await post("Runtime.enable");
            const { result } = await post("Runtime.evaluate", { expression: "globalThis.__gds" });
            const info = await post("Runtime.getProperties", { objectId: result.objectId });
            const scopes = info.internalProperties?.find((p: any) => p.name === "[[Scopes]]")?.value?.objectId;
            
            // Flatten every non-global closure scope, then try `f` (grab) on each var until one exposes the client
            const o = (scopes ? await kids(scopes) : []).filter((x: any) => has(x) && x.value.description !== "Global");
            const v = (await Promise.all(o.map((x: any) => kids(x.value.objectId)))).flat().filter(has);

            for (const x of v as any[]) {
                // Try `f` (client grab fn) on this candidate; stop as soon as one exposes the client
                const args = { objectId: x.value.objectId, functionDeclaration: f, awaitPromise: true };
                await post("Runtime.callFunctionOn", args).catch(() => {});
                if (g.__cli) return g.__cli;
            }
            return null;
        } catch {
            return null;
        } finally {
            delete g.__gds;
            delete g.__cli;
            s.disconnect();
        } 
    }

    protected override async onClientReady(): Promise<void> {
        this.origSendRequest = this.client.sendRequest.bind(this.client);
        this.client.sendRequest = this.sendRequest.bind(this);
        await super.onClientReady();
    }

    override get isRunning(): boolean {
        return super.isRunning && this.client?.state === 2;
    }

    override async fetchSymbols(doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const req = { textDocument: { uri: doc.uri.toString() } };
        const raw = await this.client.sendRequest(JavaClient.WHITELIST, req) as any;
        return (raw ?? []).map(JavaClient.toSymbol);
    }
}
