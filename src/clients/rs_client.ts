import * as vscode from "vscode";
import { PythonClient } from "./py_client";


export class RustClient extends PythonClient {
  static readonly LANGUAGES = ["rust"];

  protected override async getClient(): Promise<any> {
    const ext = vscode.extensions.getExtension("rust-lang.rust-analyzer");
    if (!ext) return null;
    if (!ext.isActive) await ext.activate();
    return ext.exports.client ?? null;
  }
}