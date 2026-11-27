import { BasedPyrightClient } from "./py_client";


export class GoClient extends BasedPyrightClient {
  static readonly LANGUAGES = ["go"];
  protected override readonly ids = ["golang.go"];
  protected override readonly probe = "function(){globalThis.__cli=this.languageClient}";
}
