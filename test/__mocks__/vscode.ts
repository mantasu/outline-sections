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
  Enum = 20,
  Event = 21,
}

export class Position {
  constructor(public line: number, public character: number) { }
}

export class Range {
  start: Position;
  end: Position;

  constructor(a: number | Position, b?: number | Position, c?: number, d?: number) {
    this.start = a instanceof Position ? a : new Position(a, (b as number) ?? 0);
    this.end = a instanceof Position ? (b as Position) : new Position(c ?? 0, d ?? 0);
  }
}

export class SelectionRange {
  constructor(public range: Range, public parent?: SelectionRange) { }
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];

  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: Range,
    public selectionRange: Range,
  ) { }
}

export class ThemeColor {
  constructor(public id: string) { }
}

export enum OverviewRulerLane { Left = 1, Center = 2, Right = 4, Full = 7 }

export class CancellationTokenSource {
  token = {};
  dispose() { }
}

export const languages = {
  registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
  registerSelectionRangeProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

export const window = {
  showTextDocument: vi.fn(async () => ({
    edit: async (callback: any) => {
      callback({
        insert: () => { },
        delete: () => { },
      });
      return true;
    },
  })),
  visibleTextEditors: [] as any[],
  createTextEditorDecorationType: vi.fn((options: any) => ({ options, dispose: vi.fn() })),
  onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
};

export const workspace = {
  textDocuments: [] as any[],
  getConfiguration: vi.fn(() => ({
    get: vi.fn((_: string, defaultValue?: any) => defaultValue),
  })),
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
};

export const extensions = {
  getExtension: vi.fn(),
};

export const commands = {
  executeCommand: vi.fn(),
};

export const Uri = {
  parse: (text: string) => ({ toString: () => text, fsPath: text }),
};
