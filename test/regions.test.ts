import { vi, describe, test, expect, beforeEach } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { parseBlocks, buildTree, regionName, readCustomRegex } from '../src/regions';

describe('regions', () => {
  beforeEach(() => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    });
  });

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

  test('parseBlocks recognizes // region markers in C-style languages', () => {
    const doc = makeDoc('typescript', [
      '// region Experimental flags',
      'const FEATURE_X = true;',
      'const FEATURE_Y = false;',
      '// endregion',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'Experimental flags', 0, 3],
    ]);
  });

  test('parseBlocks recognizes // #region markers in C-style languages', () => {
    const doc = makeDoc('typescript', [
      '// #region String helpers',
      'function a() {}',
      '// #endregion',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'String helpers', 0, 2],
    ]);
  });

  test('parseBlocks strips a trailing block-comment closer from a custom region name', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return '>{3,}\\s*(.+)';
        return defaultValue;
      }),
    });

    const doc = makeDoc('typescript', [
      '/* >>> My region */',
      'const x = 1;',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'My region', 0, 1],
    ]);
  });

  test('parseBlocks recognizes custom region start regex from settings', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return 'fold:\\s*(.+)';
        return defaultValue;
      }),
    });

    const doc = makeDoc('python', [
      '# fold: Experiments',
      'x = 1',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'Experiments', 0, 1],
    ]);
  });

  test('parseBlocks treats custom region end as optional when not configured', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return 'fold:\\s*(.+)';
        return defaultValue;
      }),
    });

    const doc = makeDoc('python', [
      '# fold: First',
      'a = 1',
      '# fold: Second',
      'b = 2',
      '# ----',
      '# Header',
      '# ----',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'First', 0, 2],
      ['region', 'Second', 2, 4],
      ['header', 'Header', 4, 6],
    ]);
  });

  test('parseBlocks recognizes custom region end regex from settings', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return 'section:\\s*(.+?)\\s*$';
        if (key === 'regionEndRegex') return 'endsection\\b';
        return defaultValue;
      }),
    });

    const doc = makeDoc('typescript', [
      '// section: Helpers',
      'const x = 1;',
      '// endsection',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'Helpers', 0, 2],
    ]);
  });

  test('parseBlocks ignores invalid custom regex settings and keeps built-in parsing', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return '['; // Invalid regex: unterminated character class
        return defaultValue;
      }),
    });

    const doc = makeDoc('python', [
      '# region BuiltIn',
      '#endregion',
    ]);

    expect(parseBlocks(doc as any)).toEqual([
      ['region', 'BuiltIn', 0, 1],
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

  test('buildTree nests a section inside the enclosing class symbol', () => {
    const doc = makeDoc('python', [
      'class Example:',
      '    # ----',
      '    # Helpers',
      '    # ----',
      '    def method(self):',
      '        pass',
    ]);

    const method = new vscode.DocumentSymbol(
      'method', '', vscode.SymbolKind.Method,
      new vscode.Range(4, 0, 5, 0), new vscode.Range(4, 0, 4, 6),
    );
    const cls = new vscode.DocumentSymbol(
      'Example', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 5, 0), new vscode.Range(0, 0, 0, 7),
    );
    cls.children.push(method);

    const tree = buildTree([cls], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toBe(cls);
    // 'method' is written while the 'Helpers' banner is still open, so it
    // nests under 'Helpers' rather than becoming a sibling of it.
    expect(tree[0].children.map(c => c.name)).toEqual(['Helpers']);
    expect(tree[0].children[0].children.map(c => c.name)).toEqual(['method']);
  });

  test('buildTree keeps a trailing class banner under the class even when it is the last member', () => {
    const doc = makeDoc('python', [
      'class Example:',
      '    def method(self):',
      '        pass',
      '    # ----',
      '    # Footer',
      '    # ----',
    ]);

    const method = new vscode.DocumentSymbol(
      'method', '', vscode.SymbolKind.Method,
      new vscode.Range(1, 0, 2, 0), new vscode.Range(1, 0, 1, 6),
    );
    const cls = new vscode.DocumentSymbol(
      'Example', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 5, 0), new vscode.Range(0, 0, 0, 7),
    );
    cls.children.push(method);

    const tree = buildTree([cls], doc as any);
    expect(tree[0]).toBe(cls);
    expect(tree[0].children.map(c => c.name)).toEqual(['method', 'Footer']);
  });

  test('buildTree keeps nested class banners under the nearest class and leaves outer-level banners outside', () => {
    const doc = makeDoc('python', [
      'class User:',
      '    def __init__(self, name: str):',
      '        self.name = name',
      '    # ---- User state ----',
      '    def greet(self):',
      '        return self.name',
      '    class InnerSession:',
      '        # ---- inner session ----',
      '        def run(self):',
      '            return "ok"',
      '    # ---- User tail ----',
      '    def close(self):',
      '        pass',
      '',
      'class Outer:',
      '    class InnerOne:',
      '        pass',
      '    # ---- Outer banner ----',
      '    def setup(self):',
      '        pass',
      '',
      '# ---- file footer ----',
    ]);

    const user = new vscode.DocumentSymbol(
      'User', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 13, 0), new vscode.Range(0, 0, 0, 4),
    );
    const inner = new vscode.DocumentSymbol(
      'InnerSession', '', vscode.SymbolKind.Class,
      new vscode.Range(6, 0, 10, 0), new vscode.Range(6, 0, 6, 13),
    );
    const greet = new vscode.DocumentSymbol(
      'greet', '', vscode.SymbolKind.Method,
      new vscode.Range(4, 0, 6, 0), new vscode.Range(4, 0, 4, 5),
    );
    const close = new vscode.DocumentSymbol(
      'close', '', vscode.SymbolKind.Method,
      new vscode.Range(11, 0, 13, 0), new vscode.Range(11, 0, 11, 5),
    );
    const outer = new vscode.DocumentSymbol(
      'Outer', '', vscode.SymbolKind.Class,
      new vscode.Range(14, 0, 21, 0), new vscode.Range(14, 0, 14, 5),
    );
    const innerOne = new vscode.DocumentSymbol(
      'InnerOne', '', vscode.SymbolKind.Class,
      new vscode.Range(15, 0, 17, 0), new vscode.Range(15, 0, 15, 8),
    );
    const setup = new vscode.DocumentSymbol(
      'setup', '', vscode.SymbolKind.Method,
      new vscode.Range(18, 0, 20, 0), new vscode.Range(18, 0, 18, 5),
    );
    user.children.push(greet, inner, close);
    inner.children.push(new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Method, new vscode.Range(8, 0, 10, 0), new vscode.Range(8, 0, 8, 3)));
    outer.children.push(innerOne, setup);

    const tree = buildTree([user, outer], doc as any);
    // A trailing module-level banner after the last class is a top-level
    // sibling, not swallowed into the preceding class.
    expect(tree.map(node => node.name)).toEqual(['User', 'Outer', 'file footer']);
    // 'greet' and 'InnerSession' are both written while 'User state' is still
    // open (real symbols never close a comment section themselves), so both
    // nest under it; 'User tail' then closes it out and follows as a sibling,
    // adopting 'close' as its own child.
    expect(tree[0].children.map(child => child.name)).toEqual(['User state', 'User tail']);
    expect(tree[0].children[0].children.map(c => c.name)).toEqual(['greet', 'InnerSession']);
    expect(tree[0].children[1].children.map(c => c.name)).toEqual(['close']);
    // Inside InnerSession, its own banner nests the 'run' method under it.
    const innerSession = tree[0].children[0].children[1];
    expect(innerSession.children.map(c => c.name)).toEqual(['inner session']);
    expect(innerSession.children[0].children.map(c => c.name)).toEqual(['run']);
    // 'InnerOne' precedes any banner so it stays a direct sibling; 'setup' is
    // written while 'Outer banner' is open, so it nests under it.
    expect(tree[1].children.map(child => child.name)).toEqual(['InnerOne', 'Outer banner']);
    expect(tree[1].children[1].children.map(c => c.name)).toEqual(['setup']);
  });

  test('buildTree keeps a nested class under its method even when a same-line parameter symbol precedes it', () => {
    // Pylance reports the `name` parameter as a Variable whose range sits on the
    // `def` line, alongside the nested `class LOL` as a sibling child of the
    // method. The parameter must not swallow the class's deeper body lines.
    const doc = makeDoc('python', [
      'class UserA:',
      '    def __init__(self, name):',
      '        ...',
      '        class LOL:',
      '            pass',
      '        # --------------------------- oooo -------------------------- #',
      '        pass',
    ]);

    const name = new vscode.DocumentSymbol(
      'name', '', vscode.SymbolKind.Variable,
      new vscode.Range(1, 24, 1, 28), new vscode.Range(1, 24, 1, 28),
    );
    const lol = new vscode.DocumentSymbol(
      'LOL', '', vscode.SymbolKind.Class,
      new vscode.Range(3, 0, 4, 0), new vscode.Range(3, 14, 3, 17),
    );
    const init = new vscode.DocumentSymbol(
      '__init__', '', vscode.SymbolKind.Method,
      new vscode.Range(1, 0, 6, 0), new vscode.Range(1, 8, 1, 16),
    );
    const userA = new vscode.DocumentSymbol(
      'UserA', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 6, 0), new vscode.Range(0, 0, 0, 10),
    );
    init.children.push(name, lol);
    userA.children.push(init);

    const tree = buildTree([userA], doc as any);
    expect(tree[0].children.map(c => c.name)).toEqual(['__init__']);
    // The parameter stays a leaf sibling; the class stays under the method (not
    // absorbed into the parameter); the trailing banner is a method-level sibling.
    expect(tree[0].children[0].children.map(c => c.name)).toEqual(['name', 'LOL', 'oooo']);
    expect(tree[0].children[0].children[0].children).toEqual([]);
    expect(tree[0].children[0].children[1].children.map(c => c.name)).toEqual([]);
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

  test('buildTree ignores a lone dashes-only divider with no title', () => {
    const doc = makeDoc('python', [
      '# ----',
      'x = 1',
      'y = 2',
    ]);

    expect(buildTree([], doc as any)).toEqual([]);
  });

  test('buildTree ignores an empty three-line banner when nothing is open', () => {
    const doc = makeDoc('python', [
      '# ----',
      '# ----',
      '# ----',
    ]);

    expect(buildTree([], doc as any)).toEqual([]);
  });

  test('buildTree closes an open header when an empty three-line banner follows', () => {
    const doc = makeDoc('python', [
      '# ----',
      '# Header',
      '# ----',
      'def a():',
      '# ----',
      '# ----',
      '# ----',
      'def b():',
    ]);

    const a = new vscode.DocumentSymbol(
      'a', '', vscode.SymbolKind.Function,
      new vscode.Range(3, 0, 3, 8), new vscode.Range(3, 0, 3, 3),
    );
    const b = new vscode.DocumentSymbol(
      'b', '', vscode.SymbolKind.Function,
      new vscode.Range(7, 0, 7, 8), new vscode.Range(7, 0, 7, 3),
    );

    const tree = buildTree([a, b], doc as any);
    const header = tree.find(n => n.name === 'Header')!;
    expect(header.children.map(c => c.name)).toEqual(['a']);
    expect(tree.some(n => n.name === 'b')).toBe(true);
  });

  test('buildTree closes an open subheader when an empty three-line banner follows', () => {
    const doc = makeDoc('python', [
      '# ---- Sub ----',
      'def a():',
      '# ----',
      '# ----',
      '# ----',
      'def b():',
    ]);

    const a = new vscode.DocumentSymbol(
      'a', '', vscode.SymbolKind.Function,
      new vscode.Range(1, 0, 1, 8), new vscode.Range(1, 0, 1, 3),
    );
    const b = new vscode.DocumentSymbol(
      'b', '', vscode.SymbolKind.Function,
      new vscode.Range(5, 0, 5, 8), new vscode.Range(5, 0, 5, 3),
    );

    const tree = buildTree([a, b], doc as any);
    const sub = tree.find(n => n.name === 'Sub')!;
    expect(sub.children.map(c => c.name)).toEqual(['a']);
    expect(tree.some(n => n.name === 'b')).toBe(true);
  });

  test('buildTree absorbs trailing line and block-continuation comments into a brace symbol', () => {
    const doc = makeDoc('typescript', [
      'function m() {',
      '  return 1;',
      '}',
      '  // trailing line comment',
      '  * block comment continuation',
    ]);

    const m = new vscode.DocumentSymbol(
      'm', '', vscode.SymbolKind.Function,
      new vscode.Range(0, 0, 2, 1), new vscode.Range(0, 0, 0, 10),
    );

    const tree = buildTree([m], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toBe(m);
  });

  test('buildTree builds region containers from custom start/end regex', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return 'section:\\s*(.+?)\\s*$';
        if (key === 'regionEndRegex') return 'endsection\\b';
        return defaultValue;
      }),
    });

    const doc = makeDoc('typescript', [
      '// section: Helpers',
      'const x = 1;',
      '// endsection',
    ]);

    const tree = buildTree([], doc as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Helpers');
  });

  test('buildTree names an unlabeled custom region "Region"', () => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'regionStartRegex') return 'fold:?(.*)$';
        return defaultValue;
      }),
    });

    const doc = makeDoc('python', [
      '# fold:',
      'x = 1',
    ]);

    const tree = buildTree([], doc as any);
    expect(tree[0].name).toBe('Region');
  });

  test('buildTree stops a nested scope when a child symbol starts past the parent body', () => {
    const doc = makeDoc('python', [
      'class P:',
      'y = 1',
      'def m():',
      '    pass',
    ]);

    const m = new vscode.DocumentSymbol(
      'm', '', vscode.SymbolKind.Method,
      new vscode.Range(2, 0, 3, 8), new vscode.Range(2, 0, 2, 8),
    );
    const cls = new vscode.DocumentSymbol(
      'P', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 1, 0), new vscode.Range(0, 0, 0, 7),
    );
    cls.children.push(m);

    const tree = buildTree([cls], doc as any);
    expect(tree[0]).toBe(cls);
    expect(tree[0].children).toEqual([]);
  });

  test('regionName handles various inputs', () => {
    expect(regionName('My Region')).toBe('My Region');
    expect(regionName('My Region */')).toBe('My Region');
    expect(regionName('My Region -->')).toBe('My Region');
    expect(regionName('')).toBe('Region');
    expect(regionName(undefined)).toBe('Region');
  });

  test('readCustomRegex handles missing and invalid markers', () => {
    // Mock config to return a value
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((_: string, defaultValue: string) => defaultValue === "" ? "my-regex" : defaultValue),
    });

    // Test valid marker
    expect(readCustomRegex('my.setting', 'ts')).toBeInstanceOf(RegExp);
    
    // Test fallback marker (prefix not in COMMENT_MARKERS)
    expect(readCustomRegex('my.setting', 'unknown-lang')).toBeInstanceOf(RegExp);
    
    // Test empty config
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn(() => ""),
    });
    expect(readCustomRegex('my.setting', 'ts')).toBeNull();
  });
});
