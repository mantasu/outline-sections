import { vi, describe, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { parseBlocks, buildTree } from '../src/regions';

describe('regions', () => {
  const makeDoc = (languageId: string, lines: string[]) => ({
    languageId,
    lineCount: lines.length,
    lineAt: (index: number) => ({ text: lines[index] }),
    getText: () => lines.join('\n'),
  });

  test('parseBlocks recognizes a header and a Python-style region', () => {
    const doc = makeDoc('python', [
      '# ----',
      '# Title',
      '# ----',
      '# region MyRegion',
      '#endregion',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['header', 'Title', 0, 4],
      ['region', 'MyRegion', 3, 4],
    ]);
  });

  test('parseBlocks recognizes a one-line subheader banner', () => {
    const doc = makeDoc('python', [
      '# ---- Example ----',
    ]);

    expect(parseBlocks(doc as any)).toEqual([['subheader', 'Example', 0, 0]]);
  });

  test('buildTree nests symbols inside region containers', () => {
    const doc = makeDoc('python', [
      '# region outer',
      'def fn():',
      '#endregion',
    ]);

    const symbol = new vscode.DocumentSymbol(
      'fn',
      '',
      vscode.SymbolKind.Function,
      new vscode.Range(1, 0, 1, 1),
      new vscode.Range(1, 0, 1, 1),
    );

    const tree = buildTree([symbol], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('outer');
    expect(tree[0].children).toContain(symbol);
  });

  test('parseBlocks auto-closes an open region when a new region starts', () => {
    const doc = makeDoc('python', [
      '# region First',
      '# region Second',
      '#endregion',
    ]);

    const blocks = parseBlocks(doc as any);
    expect(blocks).toContainEqual(['region', 'First', 0, 1]);
    expect(blocks).toContainEqual(['region', 'Second', 1, 2]);
  });

  test('parseBlocks calls closeCurrent when a three-line banner has a blank middle line', () => {
    // First banner (lines 0-2) opens a 'Title' header.
    // Second banner (lines 3-5) has only dashes → title is empty → closeCurrent closes 'Title'.
    const doc = makeDoc('python', [
      '# ----',
      '# Title',
      '# ----',
      '# ----',
      '# ----',
      '# ----',
    ]);

    const blocks = parseBlocks(doc as any);
    const header = blocks.find(b => b[0] === 'header');
    expect(header).toBeDefined();
    expect(header![1]).toBe('Title');
    expect(header![2]).toBe(0);
    expect(header![3]).toBe(3);
  });

  test('buildTree sorts multiple top-level containers by line order', () => {
    const doc = makeDoc('python', [
      '# region alpha',
      '#endregion',
      '# region beta',
      '#endregion',
    ]);

    const tree = buildTree([], doc as any);
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe('alpha');
    expect(tree[1].name).toBe('beta');
  });

  test('parseBlocks assigns the default Region name when a region has no label', () => {
    const doc = makeDoc('python', [
      '# region',
      '#endregion',
    ]);

    const blocks = parseBlocks(doc as any);
    expect(blocks[0][1]).toBe('Region');
  });

  test('parseBlocks calls closeCurrent with no matching header/subheader on stack (idx === -1)', () => {
    // A blank banner when only a region (not a header/subheader) is on the stack.
    // closeCurrent finds idx === -1 and does nothing.
    const doc = makeDoc('python', [
      '# region open',
      '# ----',
      '# ----',
      '# ----',
      '#endregion',
    ]);

    const blocks = parseBlocks(doc as any);
    // The region is still closed at the endregion
    expect(blocks.some(b => b[0] === 'region' && b[1] === 'open')).toBe(true);
  });

  test('buildTree creates a header container for a three-line banner', () => {
    const doc = makeDoc('python', [
      '# ----',
      '# Section',
      '# ----',
    ]);

    const tree = buildTree([], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Section');
  });

  test('buildTree creates a subheader container for a one-line banner', () => {
    const doc = makeDoc('python', [
      '# ---- Utils ----',
    ]);

    const tree = buildTree([], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Utils');
  });

  test('buildTree assigns a symbol to the innermost of multiple enclosing containers via minBy', () => {
    // fn() at line 4 is enclosed by both the header (lines 0-5) and the
    // inner region (lines 3-5). minBy should pick the inner region (smaller range).
    const doc = makeDoc('python', [
      '# ----',
      '# Header',
      '# ----',
      '# region inner',
      'def fn():',
      '#endregion',
    ]);

    const symbol = new vscode.DocumentSymbol(
      'fn', '', vscode.SymbolKind.Function,
      new vscode.Range(4, 0, 4, 1), new vscode.Range(4, 0, 4, 1),
    );

    const tree = buildTree([symbol], doc as any);
    const header = tree.find(c => c.name === 'Header')!;
    const inner = header.children.find(c => c.name === 'inner')!;
    expect(inner.children).toContain(symbol);
  });

  test('buildTree sorts children within a container by line order', () => {
    const doc = makeDoc('python', [
      '# region parent',
      'def b():',
      'def a():',
      '#endregion',
    ]);

    const symB = new vscode.DocumentSymbol(
      'b', '', vscode.SymbolKind.Function,
      new vscode.Range(1, 0, 1, 1), new vscode.Range(1, 0, 1, 1),
    );
    const symA = new vscode.DocumentSymbol(
      'a', '', vscode.SymbolKind.Function,
      new vscode.Range(2, 0, 2, 1), new vscode.Range(2, 0, 2, 1),
    );

    // Pass in reverse order to exercise the sort comparator
    const tree = buildTree([symA, symB], doc as any);
    const parent = tree[0];
    expect(parent.children[0].name).toBe('b');
    expect(parent.children[1].name).toBe('a');
  });

  test('parseBlocks ignores unmatched region-end lines when no region is open', () => {
    const doc = makeDoc('sql', [
      '-- endregion',
    ]);

    expect(parseBlocks(doc as any)).toEqual([]);
  });

  test('parseBlocks ignores one-line divider banners with empty titles', () => {
    const doc = makeDoc('python', [
      '# ----',
    ]);

    expect(parseBlocks(doc as any)).toEqual([]);
  });
});
