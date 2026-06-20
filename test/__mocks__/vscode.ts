import { vi } from 'vitest';

export enum SymbolKind {
  Class = 1,
  Interface = 2,
  EnumMember = 3,
  Module = 4,
  Namespace = 5,
  TypeParameter = 6,
  Function = 7,
  Method = 8,
  Constructor = 9,
  Variable = 10,
  Property = 11,
  String = 12,
  Number = 13,
  Boolean = 14,
  Null = 15,
  Array = 16,
  Object = 17,
  Key = 18,
  Struct = 19,
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  start: Position;
  end: Position;

  constructor(startLineOrPos: number | Position, startChar?: number, endLine?: number, endChar?: number) {
    if (startLineOrPos instanceof Position) {
      this.start = startLineOrPos;
      this.end = new Position(startChar ?? 0, endLine ?? 0);
    } else {
      this.start = new Position(startLineOrPos, startChar ?? 0);
      this.end = new Position(endLine ?? 0, endChar ?? 0);
    }
  }
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];

  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: Range,
    public selectionRange: Range,
  ) {}
}

export class CancellationTokenSource {
  token = {};
  dispose() {}
}

export const languages = {
  registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

export const window = {
  showTextDocument: vi.fn(async () => ({
    edit: async (callback: any) => {
      callback({
        insert: () => {},
        delete: () => {},
      });
      return true;
    },
  })),
};

export const workspace = {
  textDocuments: [] as any[],
};

export const extensions = {
  getExtension: vi.fn(),
};

export const Uri = {
  parse: (text: string) => ({ toString: () => text, fsPath: text }),
};
