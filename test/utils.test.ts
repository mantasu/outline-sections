import { vi, describe, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { minBy, toRange, navKindToSymbolKind } from '../src/utils';

describe('utils', () => {
  test('minBy selects smallest element and returns null for empty arrays', () => {
    expect(minBy([5, 2, 9], x => x)).toBe(2);
    expect(minBy([], x => x)).toBeNull();
  });

  test('toRange converts LSP and TypeScript NavTree spans', () => {
    const lspRange = toRange({ start: { line: 1, character: 2 }, end: { line: 1, character: 3 } });
    expect(lspRange.start.line).toBe(1);
    expect(lspRange.start.character).toBe(2);
    expect(lspRange.end.line).toBe(1);
    expect(lspRange.end.character).toBe(3);

    const navTreeRange = toRange({ start: { line: 2, offset: 3 }, end: { line: 2, offset: 5 } });
    expect(navTreeRange.start.line).toBe(1);
    expect(navTreeRange.start.character).toBe(2);
    expect(navTreeRange.end.line).toBe(1);
    expect(navTreeRange.end.character).toBe(4);
  });

  test('navKindToSymbolKind maps known kinds and defaults', () => {
    const mapping: Array<[string, number]> = [
      ['internal module', vscode.SymbolKind.Module],
      ['module', vscode.SymbolKind.Module],
      ['namespace', vscode.SymbolKind.Namespace],
      ['class', vscode.SymbolKind.Class],
      ['interface', vscode.SymbolKind.Interface],
      ['enum', vscode.SymbolKind.Enum],
      ['enumMember', vscode.SymbolKind.EnumMember],
      ['type', vscode.SymbolKind.TypeParameter],
      ['type parameter', vscode.SymbolKind.TypeParameter],
      ['local function', vscode.SymbolKind.Function],
      ['function', vscode.SymbolKind.Function],
      ['getter', vscode.SymbolKind.Method],
      ['setter', vscode.SymbolKind.Method],
      ['index', vscode.SymbolKind.Method],
      ['call', vscode.SymbolKind.Method],
      ['construct', vscode.SymbolKind.Method],
      ['method', vscode.SymbolKind.Method],
      ['constructor', vscode.SymbolKind.Constructor],
      ['alias', vscode.SymbolKind.Variable],
      ['let', vscode.SymbolKind.Variable],
      ['const', vscode.SymbolKind.Variable],
      ['local var', vscode.SymbolKind.Variable],
      ['var', vscode.SymbolKind.Variable],
      ['member', vscode.SymbolKind.Property],
      ['property', vscode.SymbolKind.Property],
      ['string', vscode.SymbolKind.String],
      ['number', vscode.SymbolKind.Number],
      ['boolean', vscode.SymbolKind.Boolean],
      ['null', vscode.SymbolKind.Null],
      ['array', vscode.SymbolKind.Array],
      ['object', vscode.SymbolKind.Object],
      ['key', vscode.SymbolKind.Key],
      ['struct', vscode.SymbolKind.Struct],
    ];

    for (const [kind, expected] of mapping) {
      expect(navKindToSymbolKind(kind)).toBe(expected);
    }

    expect(navKindToSymbolKind('unknown')).toBe(10);
  });
});
