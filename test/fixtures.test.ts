import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { vi, describe, test, expect, beforeEach } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { buildTree } from '../src/regions';

// These fixtures pair a real source file (test/resources/<filename>.<ext>)
// with a hand-built mock symbol tree standing in for what a real language
// server would report, and an expected outline tree recorded in
// test/resources/expected.yaml under the key `<filename>_<ext>`. Together
// they exercise: closed/unclosed regions, 3-line headers, 1-line subheaders,
// banners nested arbitrarily deep inside classes, banners glued to the end of
// a class body ("trailing" banners), banners sitting between two top-level
// symbols ("outside"), cascading headers that swallow everything up to the
// next header, and malformed/unparsable trailing code that must not crash
// the parser.

// A section with no children is a plain string; a section with children is a
// single-key mapping from its name to its list of children.
type ExpectedNode = string | Record<string, ExpectedNode[]>;

const expected = yaml.load(
  fs.readFileSync(path.join(__dirname, 'resources', 'expected.yaml'), 'utf8'),
) as Record<string, ExpectedNode[]>;

const loadDoc = (languageId: string, file: string) => {
  const lines = fs.readFileSync(path.join(__dirname, 'resources', file), 'utf8').split('\n');
  return {
    languageId,
    lineCount: lines.length,
    lineAt: (index: number) => ({ text: lines[index] }),
    getText: () => lines.join('\n'),
  } as unknown as vscode.TextDocument;
};

const sym = (
  name: string,
  kind: vscode.SymbolKind,
  start: number,
  end: number,
  children: vscode.DocumentSymbol[] = [],
): vscode.DocumentSymbol => {
  const s = new vscode.DocumentSymbol(
    name, '', kind,
    new vscode.Range(start, 0, end, 999),
    new vscode.Range(start, 0, start, 0),
  );
  s.children = children;
  return s;
};

const toExpected = (nodes: vscode.DocumentSymbol[]): ExpectedNode[] =>
  nodes.map(n => (n.children.length ? { [n.name]: toExpected(n.children) } : n.name));

describe('outline fixtures', () => {
  beforeEach(() => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    });
  });

  test('tmp_test_py: cascading subheaders/headers nest across sibling classes as documented', () => {
    const doc = loadDoc('python', 'tmp_test.py');
    const K = vscode.SymbolKind;
    const symbols = [
      sym('User', K.Class, 0, 4, [
        sym('__init__', K.Method, 1, 3),
      ]),
      sym('User2', K.Class, 7, 26, [
        sym('Inner1', K.Class, 8, 11),
        sym('Inner2', K.Class, 15, 17),
        sym('Inner3', K.Class, 20, 21),
        sym('Inner4', K.Class, 23, 26),
      ]),
      sym('User3', K.Class, 29, 34, [
        sym('__init__', K.Method, 33, 34),
      ]),
    ];

    const tree = buildTree(symbols, doc);
    expect(toExpected(tree)).toEqual(expected.tmp_test_py);
  });

  test('test_py: nests sections under closed regions, cascading headers, and trailing banners', () => {
    const doc = loadDoc('python', 'test.py');
    const K = vscode.SymbolKind;
    const symbols = [
      sym('helper_one', K.Function, 2, 3),
      sym('helper_two', K.Function, 6, 11, [
        sym('closure', K.Function, 9, 10),
      ]),
      sym('Deep', K.Class, 16, 21, [
        sym('Middle', K.Class, 17, 21, [
          sym('Inner', K.Class, 18, 21, [
            sym('deep', K.Method, 20, 21),
          ]),
        ]),
      ]),
      sym('Account', K.Class, 25, 27, [
        sym('__init__', K.Method, 26, 27),
      ]),
      sym('Ledger', K.Class, 32, 50, [
        sym('Entries', K.Class, 33, 34),
        sym('Totals', K.Class, 40, 41),
        sym('Snapshot', K.Class, 45, 45),
        sym('Audit', K.Class, 48, 50),
      ]),
      sym('Profile', K.Class, 55, 60, [
        sym('__init__', K.Method, 59, 60),
      ]),
      sym('unbounded_one', K.Function, 69, 70),
    ];

    const tree = buildTree(symbols, doc);
    expect(toExpected(tree)).toEqual(expected.test_py);
  });

  test('test_ts: nests sections under closed regions, cascading headers, and trailing banners', () => {
    const doc = loadDoc('typescript', 'test.ts');
    const K = vscode.SymbolKind;
    const symbols = [
      sym('onLoad', K.Function, 2, 5),
      sym('onSave', K.Function, 6, 14, [
        sym('persist', K.Function, 9, 12),
      ]),
      sym('Deep', K.Namespace, 17, 28, [
        sym('Middle', K.Namespace, 18, 27, [
          sym('Inner', K.Class, 19, 26, [
            sym('run', K.Method, 21, 24),
          ]),
        ]),
      ]),
      sym('Shop', K.Namespace, 29, 69, [
        sym('Cart', K.Class, 30, 38, [
          sym('add', K.Method, 33, 36),
        ]),
        sym('Inventory', K.Class, 41, 67, [
          sym('Reserved', K.Class, 42, 46),
          sym('Stock', K.Class, 51, 54),
          sym('Ledger', K.Class, 57, 60),
          sym('Audit', K.Class, 62, 66),
        ]),
      ]),
      sym('Config', K.Class, 70, 76, [
        sym('constructor', K.Constructor, 74, 75),
      ]),
      sym('unboundedOne', K.Function, 83, 86),
    ];

    const tree = buildTree(symbols, doc);
    expect(toExpected(tree)).toEqual(expected.test_ts);
  });

  test('test_rs: nests sections under closed regions, cascading headers, and trailing banners', () => {
    const doc = loadDoc('rust', 'test.rs');
    const K = vscode.SymbolKind;
    const symbols = [
      sym('on_load', K.Function, 2, 5),
      sym('on_save', K.Function, 6, 13, [
        sym('persist', K.Function, 9, 12),
      ]),
      sym('deep', K.Module, 16, 27, [
        sym('middle', K.Module, 17, 26, [
          sym('inner', K.Module, 18, 25, [
            sym('run', K.Function, 20, 23),
          ]),
        ]),
      ]),
      sym('shop', K.Module, 28, 74, [
        sym('Cart', K.Struct, 29, 39, [
          sym('add', K.Method, 34, 37),
        ]),
        sym('Inventory', K.Struct, 42, 72, [
          sym('reserved', K.Module, 47, 51),
          sym('stock', K.Module, 56, 59),
          sym('ledger', K.Module, 62, 65),
          sym('audit', K.Module, 67, 71),
        ]),
      ]),
      sym('Config', K.Struct, 75, 87, [
        sym('new', K.Function, 83, 86),
      ]),
      sym('unbounded_one', K.Function, 94, 97),
    ];

    const tree = buildTree(symbols, doc);
    expect(toExpected(tree)).toEqual(expected.test_rs);
  });

  test('test_cpp: nests sections under closed regions, cascading headers, and trailing banners', () => {
    const doc = loadDoc('cpp', 'test.cpp');
    const K = vscode.SymbolKind;
    const symbols = [
      sym('on_load', K.Function, 2, 5),
      sym('on_save', K.Function, 6, 14, [
        sym('persist', K.Variable, 9, 12),
      ]),
      sym('deep', K.Namespace, 17, 29, [
        sym('middle', K.Namespace, 18, 28, [
          sym('Inner', K.Class, 19, 27, [
            sym('run', K.Method, 22, 25),
          ]),
        ]),
      ]),
      sym('Cart', K.Class, 30, 39, [
        sym('add', K.Method, 32, 35),
      ]),
      sym('Inventory', K.Class, 41, 72, [
        sym('Reserved', K.Class, 43, 48),
        sym('Stock', K.Class, 53, 57),
        sym('Ledger', K.Class, 60, 64),
        sym('Audit', K.Class, 66, 71),
      ]),
      sym('Config', K.Class, 74, 83, [
        sym('Config', K.Constructor, 79, 80),
      ]),
      sym('unbounded_one', K.Function, 90, 93),
    ];

    const tree = buildTree(symbols, doc);
    expect(toExpected(tree)).toEqual(expected.test_cpp);
  });
});
