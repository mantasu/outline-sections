import * as vscode from "vscode";
import { PythonClient } from "./py_client";


export class JavaClient extends PythonClient {
    static readonly LANGUAGES = ["java"];

    protected override async getClient(): Promise<any> {
        // Get the analyser extension and await JDT LS is running
        const ext = vscode.extensions.getExtension("redhat.java");
        if (!ext) return null;
        if (!ext.isActive) await ext.activate();
        await ext.exports.serverRunning?.();

        // Its exported `getDocumentSymbols` closes over the client getter
        const probe = "async function(){const c=this.getActiveLanguageClient; if(c) globalThis.__cli=await c.call(this)}";
        return this.scan(ext.exports.getDocumentSymbols, probe);
    }
}
