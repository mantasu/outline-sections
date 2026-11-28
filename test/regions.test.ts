import { vi, describe, test, expect, beforeEach } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { buildTree, findMarks, sectionsAt } from '../src/regions';
import { makeDoc, mockSettings, sections } from './helpers';

describe('regions', () => {
  beforeEach(() => {
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: vi.fn((_: string, defaultValue?: unknown) => defaultValue),
    });
  });

  test('parser recognizes a header and a Python-style region', () => {
    const doc = makeDoc('python', [
      '# ----',
      '# Title',
      '# ----',
      '# region MyRegion',
      '#endregion',
    ]);

    expect(sections(doc)).toEqual([
      ['header', 'Title', 0, 4],
      ['region', 'MyRegion', 3, 4],
    ]);
  });

  test('parser recognizes // region markers in C-style languages', () => {
    const doc = makeDoc('typescript', [
      '// region Experimental flags',
      'const FEATURE_X = true;',
      'const FEATURE_Y = false;',
      '// endregion',
    ]);

    expect(sections(doc)).toEqual([
      ['region', 'Experimental flags', 0, 3],
    ]);
  });

  test('parser recognizes // #region markers in C-style languages', () => {
    const doc = makeDoc('typescript', [
      '// #region String helpers',
      'function a() {}',
      '// #endregion',
    ]);

    expect(sections(doc)).toEqual([
      ['region', 'String helpers', 0, 2],
    ]);
  });

  test('parser strips a trailing block-comment closer from a custom region name', () => {
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

    expect(sections(doc)).toEqual([
      ['region', 'My region', 0, 1],
    ]);
  });

  test('parser recognizes custom region start regex from settings', () => {
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

    expect(sections(doc)).toEqual([
      ['region', 'Experiments', 0, 1],
    ]);
  });

  test('parser treats custom region end as optional when not configured', () => {
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

    expect(sections(doc)).toEqual([
      ['region', 'First', 0, 2],
      ['region', 'Second', 2, 4],
      ['header', 'Header', 4, 6],
    ]);
  });

  test('parser recognizes custom region end regex from settings', () => {
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

    expect(sections(doc)).toEqual([
      ['region', 'Helpers', 0, 2],
    ]);
  });

  test('parser ignores invalid custom regex settings and keeps built-in parsing', () => {
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

    expect(sections(doc)).toEqual([
      ['region', 'BuiltIn', 0, 1],
    ]);
  });

  test('parser recognizes a one-line subheader banner', () => {
    const doc = makeDoc('python', [
      '# ---- Example ----',
    ]);

    expect(sections(doc)).toEqual([['subheader', 'Example', 0, 0]]);
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

  test('parser auto-closes an open region when a new region starts', () => {
    const doc = makeDoc('python', [
      '# region First',
      '# region Second',
      '#endregion',
    ]);

    const blocks = sections(doc);
    expect(blocks).toContainEqual(['region', 'First', 0, 1]);
    expect(blocks).toContainEqual(['region', 'Second', 1, 2]);
  });

  test('parser calls closeCurrent when a three-line banner has a blank middle line', () => {
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

    const blocks = sections(doc);
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

  test('parser assigns the default Region name when a region has no label', () => {
    const doc = makeDoc('python', [
      '# region',
      '#endregion',
    ]);

    const blocks = sections(doc);
    expect(blocks[0][1]).toBe('Region');
  });

  test('parser calls closeCurrent with no matching header/subheader on stack (idx === -1)', () => {
    // A blank banner when only a region (not a header/subheader) is on the stack.
    // closeCurrent finds idx === -1 and does nothing.
    const doc = makeDoc('python', [
      '# region open',
      '# ----',
      '# ----',
      '# ----',
      '#endregion',
    ]);

    const blocks = sections(doc);
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

  test('parser ignores unmatched region-end lines when no region is open', () => {
    const doc = makeDoc('sql', [
      '-- endregion',
    ]);

    expect(sections(doc)).toEqual([]);
  });

  test('parser ignores one-line divider banners with empty titles', () => {
    const doc = makeDoc('python', [
      '# ----',
    ]);

    expect(sections(doc)).toEqual([]);
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

  test('buildTree does not skip lines for symbols already covered by a previous sibling', () => {
    // Pylance reports `self.x` attributes as class children whose ranges lie
    // inside `__init__`; they must not push the scan past the following region.
    const doc = makeDoc('python', [
      'class A:',
      '    def __init__(self):',
      '        self.x = 1',
      '    # region R',
      '    # endregion',
    ]);

    const init = new vscode.DocumentSymbol(
      '__init__', '', vscode.SymbolKind.Method,
      new vscode.Range(1, 4, 2, 18), new vscode.Range(1, 8, 1, 16),
    );
    const x = new vscode.DocumentSymbol(
      'x', '', vscode.SymbolKind.Variable,
      new vscode.Range(2, 13, 2, 14), new vscode.Range(2, 13, 2, 14),
    );
    const cls = new vscode.DocumentSymbol(
      'A', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 2, 18), new vscode.Range(0, 6, 0, 7),
    );
    cls.children.push(init, x);

    const tree = buildTree([cls], doc as any);
    expect(tree[0]).toBe(cls);
    expect(cls.children.map(c => c.name)).toEqual(['__init__', 'x', 'R']);
  });

  test('buildTree does not nest body comments under a parameter declared mid-line', () => {
    // Ranges as reported by Pylance: the parameter `a` lives on the `def` line.
    const doc = makeDoc('python', [
      'class A:',
      '    def __init__(self, a):',
      '        # region A',
      '        # endregion',
      '        pass',
    ]);

    const a = new vscode.DocumentSymbol(
      'a', '', vscode.SymbolKind.Variable,
      new vscode.Range(1, 23, 1, 24), new vscode.Range(1, 23, 1, 24),
    );
    const init = new vscode.DocumentSymbol(
      '__init__', '', vscode.SymbolKind.Method,
      new vscode.Range(1, 4, 4, 12), new vscode.Range(1, 8, 1, 16),
    );
    init.children.push(a);
    const cls = new vscode.DocumentSymbol(
      'A', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 4, 12), new vscode.Range(0, 6, 0, 7),
    );
    cls.children.push(init);

    const tree = buildTree([cls], doc as any);
    expect(init.children.map(c => c.name)).toEqual(['a', 'A']);
    expect(a.children).toEqual([]);
  });

  test('buildTree still absorbs trailing body comments into a decorated method', () => {
    // Pylance starts a decorated method's range at the decorator line.
    const doc = makeDoc('python', [
      'class A:',
      '    @staticmethod',
      '    def s(b):',
      '        pass',
      '        # region T',
      '        # endregion',
    ]);

    const b = new vscode.DocumentSymbol(
      'b', '', vscode.SymbolKind.Variable,
      new vscode.Range(2, 10, 2, 11), new vscode.Range(2, 10, 2, 11),
    );
    const s = new vscode.DocumentSymbol(
      's', '', vscode.SymbolKind.Method,
      new vscode.Range(1, 4, 3, 12), new vscode.Range(2, 8, 2, 9),
    );
    s.children.push(b);
    const cls = new vscode.DocumentSymbol(
      'A', '', vscode.SymbolKind.Class,
      new vscode.Range(0, 0, 3, 12), new vscode.Range(0, 6, 0, 7),
    );
    cls.children.push(s);

    buildTree([cls], doc as any);
    expect(cls.children.map(c => c.name)).toEqual(['s']);
    expect(s.children.map(c => c.name)).toEqual(['b', 'T']);
    expect(b.children).toEqual([]);
  });

  test('buildTree does not nest constructor body regions under a TypeScript parameter property', () => {
    const doc = makeDoc('typescript', [
      'class C {',
      '  constructor(private p: number) {',
      '    // region R',
      '    // endregion',
      '  }',
      '}',
    ]);

    const span = (s: number, sc: number, e: number, ec: number) => new vscode.Range(s, sc, e, ec);
    const ctor = new vscode.DocumentSymbol('constructor', '', vscode.SymbolKind.Constructor, span(1, 2, 4, 3), span(1, 2, 4, 3));
    const p = new vscode.DocumentSymbol('p', '', vscode.SymbolKind.Property, span(1, 14, 1, 31), span(1, 14, 1, 31));
    const cls = new vscode.DocumentSymbol('C', '', vscode.SymbolKind.Class, span(0, 0, 5, 1), span(0, 0, 5, 1));
    cls.children.push(ctor, p);

    buildTree([cls], doc as any);
    expect(ctor.children.map(c => c.name)).toEqual(['R']);
    expect(p.children).toEqual([]);
  });

  test('region names drop trailing comment closers and default to "Region"', () => {
    const doc = makeDoc('html', [
      '<!-- #region Layout -->',
      '<!-- #endregion -->',
      '<!-- region -->',
    ]);

    expect(sections(doc)).toEqual([
      ['region', 'Layout', 0, 1],
      ['region', 'Region', 2, 2],
    ]);
  });

  test('dividers accept any common rule character', () => {
    const doc = makeDoc('python', [
      '# ==== Equals ====',
      '# **** Stars ****',
      '# >>>>>> Arrows <<<<<<',
      '# .... Dots ....',
      '########## Hashes ##########',
      '# ~~~ Too short ~~~',
    ]);

    expect(sections(doc).map(s => s[1])).toEqual(['Equals', 'Stars', 'Arrows', 'Dots', 'Hashes']);
  });

  test('brace languages take // and /* */ dividers, including solid rules', () => {
    const doc = makeDoc('typescript', [
      '// ---- Line ----',
      '/*****************/',
      '/* Block         */',
      '/*****************/',
      '//////////////////',
      '// Slashes',
      '//////////////////',
    ]);

    expect(sections(doc)).toEqual([
      ['subheader', 'Line', 0, 1],
      ['header', 'Block', 1, 4],
      ['header', 'Slashes', 4, 6],
    ]);
  });

  test('rules made of the comment character itself are stripped cleanly', () => {
    expect(sections(makeDoc('python', ['# #### Hash ####']))).toEqual([['subheader', 'Hash', 0, 0]]);
    expect(sections(makeDoc('html', ['<!---------->', '<!-- Page -->', '<!---------->']))).toEqual([['header', 'Page', 0, 2]]);
    expect(sections(makeDoc('sql', ['--------------', '-- Queries', '--------------']))).toEqual([['header', 'Queries', 0, 2]]);
  });

  test('titles keep their own punctuation', () => {
    expect(sections(makeDoc('cpp', ['// ---- C++ <T> ----']))).toEqual([['subheader', 'C++ <T>', 0, 0]]);
  });

  test('doc-comment banners get clean titles', () => {
    const doc = makeDoc('typescript', ['/////////////', '/// Window APIs', '/////////////', '/** ---- Docs ---- */']);
    expect(sections(doc).map(s => s[1])).toEqual(['Window APIs', 'Docs']);
  });

  test('ASCII art, comment tables and code after a closed comment are not sections', () => {
    const doc = makeDoc('javascript', [
      '//            ______/\\/~    |      /',
      '// -------- | ----------------',
      '// negative |   0:0   |   0:1',
      '// -------- | ------- | -------',
      '/******/ (function(modules) { // webpackBootstrap',
      '/******/ \t// The module cache',
      '/******/ \tvar installedModules = {};',
    ]);
    expect(sections(doc)).toEqual([]);
    expect(sections(makeDoc('python', ['# ------', '# |', '# ------']))).toEqual([]);
  });

  test('sections work in languages without a supported analyser', () => {
    expect(sections(makeDoc('lua', ['-- region Setup', 'x = 1', '-- endregion', '-- ==== Loop ====']))).toEqual([
      ['region', 'Setup', 0, 2],
      ['subheader', 'Loop', 3, 3],
    ]);
    expect(sections(makeDoc('go', ['// #region Handlers', '// #endregion']))).toEqual([['region', 'Handlers', 0, 1]]);
    expect(sections(makeDoc('csharp', ['#region Fields', '#endregion']))).toEqual([['region', 'Fields', 0, 1]]);
    expect(sections(makeDoc('cpp', ['#pragma region Math', '#pragma endregion']))).toEqual([['region', 'Math', 0, 1]]);
    expect(sections(makeDoc('latex', ['% ==== Intro ====']))).toEqual([['subheader', 'Intro', 0, 0]]);
    expect(sections(makeDoc('somelang', ['# ---- Hash ----', '// ---- Slash ----']))).toEqual([
      ['subheader', 'Hash', 0, 1],
      ['subheader', 'Slash', 1, 1],
    ]);
  });

  test('a private #region field is not a region in JavaScript/TypeScript', () => {
    expect(sections(makeDoc('typescript', ['class A {', '  #region = 1;', '}']))).toEqual([]);
  });

  test('a code line between two rules is not a header', () => {
    expect(sections(makeDoc('python', ['# ------', 'CONFIG = load()', '# ------']))).toEqual([]);
  });

  test('a blank line between two rules closes the open subheader', () => {
    const doc = makeDoc('python', ['# ---- Sub ----', 'a = 1', '# ------', '', '# ------', 'b = 2']);
    expect(sections(doc)).toEqual([['subheader', 'Sub', 0, 2]]);
  });

  test('custom divider regex adds rule styles and an invalid one is ignored', () => {
    mockSettings({ dividerRegex: '(?:- ){3,}-' });
    expect(sections(makeDoc('python', ['# - - - - Spaced - - - -']))).toEqual([['subheader', 'Spaced', 0, 0]]);

    mockSettings({ dividerRegex: '(' });
    expect(sections(makeDoc('python', ['# ---- Still works ----', '# - - - - Spaced - - - -']))).toEqual([
      ['subheader', 'Still works', 0, 1],
    ]);
  });

  test('custom region regex is anchored and named by its first matching group', () => {
    mockSettings({ regionStartRegex: 'note:\\s*(.+)|todo:\\s*(.+)' });
    const doc = makeDoc('python', ['# todo: Later', 'x = "todo: not a comment"']);
    expect(sections(doc)).toEqual([['region', 'Later', 0, 1]]);
  });

  test('regions after `self.*` attributes stay in a Python class outline (#2)', () => {
    const rule = '    # ' + '='.repeat(147);
    const doc = makeDoc('python', [
      'class Klasa:',
      '    def __init__(self):',
      '        self.testowa = {',
      "            'pole_C': None",
      '        }',
      '        self.zmienna_A = None',
      '        self.zmienna_B = 0',
      '',
      rule, '    # region ROZPOCZĘCIE', '', '    # endregion', rule,
      '',
      rule, '    # region DZIAŁANIE KOMPONENTU', '', '    # endregion', rule,
    ]);

    // Ranges as Pylance reports them: attributes are class children inside `__init__`
    const sym = (name: string, s: number, sc: number, e: number, ec: number) =>
      new vscode.DocumentSymbol(name, '', vscode.SymbolKind.Variable, new vscode.Range(s, sc, e, ec), new vscode.Range(s, sc, s, ec));
    const cls = sym('Klasa', 0, 0, 18, 72);
    cls.children.push(sym('__init__', 1, 4, 6, 26), sym('testowa', 2, 13, 2, 20), sym('zmienna_A', 5, 13, 5, 22), sym('zmienna_B', 6, 13, 6, 22));

    const tree = buildTree([cls], doc);
    expect(tree.map(n => n.name)).toEqual(['Klasa']);
    expect(cls.children.map(n => n.name)).toEqual(['__init__', 'testowa', 'zmienna_A', 'zmienna_B', 'ROZPOCZĘCIE', 'DZIAŁANIE KOMPONENTU']);
  });

  test('a region wrapped in bare rules stays a region, not a banner title', () => {
    const doc = makeDoc('python', ['# ======', '# region Setup', '# ======', 'x = 1', '# endregion']);
    expect(sections(doc)).toEqual([['region', 'Setup', 1, 4]]);
  });

  test('arrow and double-line C banners need no settings (#1 follow-up)', () => {
    const doc = makeDoc('c', [
      '/* >>>>> LIBV4L2 USAGE >>>>>',
      ' * multi-line comment body',
      ' */',
      '/* ========================================================= */',
      '/* ========================================================= */',
      '/* ========================================================= */',
      '/* >>>>>>>>>>> LIB CONSTRUCTOR/DESTRUCTOR */',
      '/* <<<<<<<<< YUV CONVERSION <<<<<<<< */',
    ]);
    expect(sections(doc)).toEqual([
      ['subheader', 'LIBV4L2 USAGE', 0, 3],
      ['subheader', 'LIB CONSTRUCTOR/DESTRUCTOR', 6, 7],
      ['subheader', 'YUV CONVERSION', 7, 7],
    ]);
  });

  // Outline as nested names (a node with children becomes { name: children }), and a one-line symbol
  const tree = (nodes: vscode.DocumentSymbol[]): unknown[] => nodes.map(n => (n.children.length ? { [n.name]: tree(n.children) } : n.name));
  const fn = (name: string, line: number, col = 0, children: vscode.DocumentSymbol[] = []) => Object.assign(
    new vscode.DocumentSymbol(name, '', vscode.SymbolKind.Function, new vscode.Range(line, col, line, 30), new vscode.Range(line, col + 4, line, col + 9)),
    { children });

  test('findMarks splits marker lines into labels, rules, delimiters and keywords', () => {
    const doc = makeDoc('python', ['# ---- Sub ----', '##########', '# Head', '##########', '# region R', '# endregion R']);
    expect(findMarks(doc).map(m => `${m.kind}.${m.part}@${m.line}:${m.from}-${m.to}`)).toEqual([
      'subheader.label@0:7-10', 'subheader.delimiter@0:0-1', 'subheader.rule@0:2-6', 'subheader.rule@0:11-15',
      'header.rule@1:0-10', 'header.label@2:2-6', 'header.delimiter@2:0-1', 'header.rule@3:0-10',
      'region.label@4:9-10', 'region.delimiter@4:0-1', 'region.keyword@4:2-8',
      'endregion.label@5:12-13', 'endregion.delimiter@5:0-1', 'endregion.keyword@5:2-11',
    ]);
  });

  test('findMarks treats custom region patterns like built-in ones', () => {
    mockSettings({ regionStartRegex: 'note:\\s*(.+)', regionEndRegex: 'endnote' });
    const doc = makeDoc('python', ['# note: Helpers', 'x = 1', '# endnote']);
    expect(findMarks(doc).map(m => `${m.kind}.${m.part}@${m.line}:${m.from}-${m.to}`)).toEqual([
      'region.label@0:8-15', 'region.delimiter@0:0-1', 'region.keyword@0:2-7', 'endregion.delimiter@2:0-1', 'endregion.keyword@2:2-9',
    ]);
  });

  test('a region closed by an end marker contains the sections opened inside it (#5)', () => {
    const lines = ['# ====', '# Banner', '# ====', '# ---- Divider ----'];
    const one = makeDoc('python', ['# region Region', ...lines, 'def func(): pass', '# endregion Region']);
    expect(tree(buildTree([fn('func', 5)], one))).toEqual([{ Region: [{ Banner: [{ Divider: ['func'] }] }] }]);

    const two = makeDoc('python', [...lines.slice(0, 3), '# region Region1', lines[3], 'def func1(): pass', '# endregion Region1',
      '# region Region2', 'def func2(): pass', '# endregion Region2']);
    expect(tree(buildTree([fn('func1', 5), fn('func2', 8)], two))).toEqual([{ Banner: [{ Region1: [{ Divider: ['func1'] }] }, { Region2: ['func2'] }] }]);

    const three = makeDoc('python', ['# region Region1', 'def func1(): pass', '# region Region2', 'def func2(): pass', '# endregion Region2', '# endregion Region1']);
    expect(tree(buildTree([fn('func1', 1), fn('func2', 3)], three))).toEqual([{ Region1: ['func1', { Region2: ['func2'] }] }]);
  });

  test('regions without an end marker keep auto-closing at the next section', () => {
    const doc = makeDoc('python', ['# region A', 'def a(): pass', '# region B', 'def b(): pass', '# ---- Div ----', 'def c(): pass']);
    expect(tree(buildTree([fn('a', 1), fn('b', 3), fn('c', 5)], doc))).toEqual([{ A: ['a'] }, { B: ['b'] }, { Div: ['c'] }]);
  });

  test('an end marker closes the region it pairs with, even when that one is in another scope', () => {
    const doc = makeDoc('python', ['# region R', 'class K:', '    # region Inner', '    def m(self): pass', '# endregion', 'def z(): pass', '# endregion']);
    const k = Object.assign(fn('K', 1), { range: new vscode.Range(1, 0, 3, 30), children: [fn('m', 3, 4)] });
    expect(tree(buildTree([k, fn('z', 5)], doc))).toEqual([{ R: [{ K: [{ Inner: ['m'] }] }, 'z'] }]);
  });

  test('sectionsAt lists the sections around a line, outermost first, without boundary overlaps', () => {
    const doc = makeDoc('python', ['# ====', '# Banner', '# ====', '# region R', '# ---- Divider ----', 'x = 1', '# endregion', '# ---- Next ----']);
    const at = (line: number) => sectionsAt(doc, line).map(s => [s.kind, s.range.start.line, s.range.end.line]);
    expect(at(5)).toEqual([['header', 0, 7], ['region', 3, 6], ['subheader', 4, 6]]);
    expect(at(7)).toEqual([['header', 0, 7], ['subheader', 7, 7]]);
    expect(sectionsAt(doc, 0)[0].range.end.character).toBe('# ---- Next ----'.length);
  });

  test('sectionsAt reuses the last outline (with symbols) until the document changes', () => {
    const doc = Object.assign(makeDoc('python', ['class A:', '    # ---- Inner ----', '    def m(self): pass', '# ---- Outer ----']), { version: 1 });
    buildTree([Object.assign(fn('A', 0), { range: new vscode.Range(0, 0, 2, 30), children: [fn('m', 2, 4)] })], doc);
    expect(sectionsAt(doc, 2).map(s => s.range.end.line)).toEqual([2]);
    (doc as any).version = 2;
    expect(sectionsAt(doc, 2).map(s => s.range.end.line)).toEqual([3]);
  });

  test('settings are read for the document so language-specific overrides apply', () => {
    const doc = makeDoc('lua', ['-- x']);
    sections(doc);
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('outlineSections', doc);
  });
});
