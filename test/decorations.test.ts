import { vi, describe, beforeEach, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { registerDecorations } from '../src/decorations';
import { makeDoc, mockSettings } from './helpers';

const win = vscode.window as any, ws = vscode.workspace as any;
const listener = (event: any) => event.mock.calls.at(-1)[0];
const styles = () => win.createTextEditorDecorationType.mock.results.map((r: any) => r.value);
const editor = (lines: string[], line = 0) => ({ document: makeDoc('python', lines), selection: { active: { line } }, setDecorations: vi.fn() });

// Every kind/part style gets an `x-key` (highest specificity) so tests can tell them apart
const KEYS = ['header', 'subheader', 'region', 'endregion'].flatMap(k => ['label', 'rule', 'delimiter', 'keyword', 'scope'].map(p => `${k}.${p}`));
const tagged = (...css: string[]) => [...KEYS.map(key => `.${key.replace('.', ' .')} { x-key: ${key} }`), ...css];
const style = (key: string) => styles().find((s: any) => s.options.xKey === key);
const options = (key: string) => { const { xKey, ...rest } = style(key).options; return rest; };

// Latest ranges an editor got for a style, as [line, from, toLine, to]
const ranges = (ed: ReturnType<typeof editor>, key: string) => ed.setDecorations.mock.calls.filter(c => c[0] === style(key)).at(-1)?.[1]
  .map((r: any) => [r.start.line, r.start.character, r.end.line, r.end.character]);

describe('decorations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    win.visibleTextEditors = [];
  });

  test('the classic profile file styles every part of marker lines with the kind\'s theme colour', () => {
    mockSettings();
    registerDecorations({ subscriptions: [] } as any);

    const [label, rule] = styles().map((s: any) => s.options);
    const color = new vscode.ThemeColor('outlineSections.headerForeground');
    expect(styles()).toHaveLength(16);
    expect(label).toEqual({ color, fontWeight: 'bold', fontStyle: 'italic', overviewRulerColor: color, isWholeLine: false });
    expect(rule).toEqual({ color, fontWeight: 'bold', fontStyle: 'italic', isWholeLine: false });
  });

  test('each part of a marker line gets its own ranges', () => {
    mockSettings({ profile: 'custom', css: tagged() });
    const ed = editor(['# ---- Sub ----', '# region R', '# endregion']);
    win.visibleTextEditors = [ed];
    const ctx = { subscriptions: [] as any[] };
    registerDecorations(ctx as any);

    expect(ranges(ed, 'subheader.label')).toEqual([[0, 7, 0, 10]]);
    expect(ranges(ed, 'subheader.rule')).toEqual([[0, 2, 0, 6], [0, 11, 0, 15]]);
    expect(ranges(ed, 'region.delimiter')).toEqual([[1, 0, 1, 1]]);
    expect(ranges(ed, 'region.keyword')).toEqual([[1, 2, 1, 8]]);
    expect(ranges(ed, 'endregion.keyword')).toEqual([[2, 2, 2, 11]]);
    expect(ranges(ed, 'header.label')).toEqual([]);
    expect(ctx.subscriptions).toHaveLength(5);
  });

  test('user rules cascade over the profile by specificity, then order', () => {
    mockSettings({ css: tagged(
      '.endregion .keyword { color: #c586c0 }', '.keyword { color: red }',
      '.header { --color: #123456; font-weight: 900 }', '.delimiter { all: unset }',
      '.subheader .label { font-style: unset }', '.scope { background-color: var(--color) }',
    ) });
    registerDecorations({ subscriptions: [] } as any);

    expect([options('endregion.keyword').color, options('region.keyword').color]).toEqual(['#c586c0', 'red']);
    expect(options('header.label')).toMatchObject({ color: '#123456', overviewRulerColor: '#123456', fontWeight: '900' });
    expect(options('header.delimiter')).toEqual({ isWholeLine: false });
    expect(options('subheader.label').fontStyle).toBeUndefined();
    expect(options('header.scope')).toEqual({ backgroundColor: '#123456', isWholeLine: true });
    expect(options('region.scope').backgroundColor).toEqual(new vscode.ThemeColor('outlineSections.regionForeground'));
  });

  test('CSS values: var(--color) in a value is the theme variable; colons, comments and junk are handled', () => {
    mockSettings({ profile: 'custom', css: '/* note */ .label { border: 1px solid var(--color); background-image: url(data:x); junk; : x }' });
    registerDecorations({ subscriptions: [] } as any);

    expect(styles()).toHaveLength(4);
    expect(styles()[0].options).toEqual({
      border: '1px solid var(--vscode-outlineSections-headerForeground)', backgroundImage: 'url(data:x)', isWholeLine: false,
    });
  });

  test('the none profile leaves comments plain, even with user rules; unknown classes match nothing', () => {
    mockSettings({ profile: 'none', css: ['.label { color: red }'] });
    const ed = editor(['# ---- Sub ----']);
    win.visibleTextEditors = [ed];
    registerDecorations({ subscriptions: [] } as any);
    listener(win.onDidChangeTextEditorSelection)({ textEditor: ed });
    expect(win.createTextEditorDecorationType).not.toHaveBeenCalled();
    expect(ed.setDecorations).not.toHaveBeenCalled();

    mockSettings({ profile: 'custom', css: ['.title { color: red }', '.label.extra { color: red }'] });
    listener(ws.onDidChangeConfiguration)({ affectsConfiguration: () => true });
    expect(win.createTextEditorDecorationType).not.toHaveBeenCalled();
  });

  test('the focus profile tints the section around the cursor and follows it', () => {
    mockSettings({ profile: 'focus', css: tagged() });
    const ed = editor(['# ---- A ----', 'x = 1', '# ---- B ----', 'y = 2'], 1);
    win.visibleTextEditors = [ed];
    registerDecorations({ subscriptions: [] } as any);

    expect(options('subheader.scope').backgroundColor).toContain('subheaderForeground');
    expect(ranges(ed, 'subheader.scope')).toEqual([[0, 0, 2, 13]]);
    ed.selection.active.line = 3;
    listener(win.onDidChangeTextEditorSelection)({ textEditor: ed });
    expect(ranges(ed, 'subheader.scope')).toEqual([[2, 0, 3, 5]]);
  });

  test('a scope styled for one kind only still follows the cursor', () => {
    mockSettings({ profile: 'custom', css: ['.region .scope { background-color: red }'] });
    const ed = editor(['# region R', 'x = 1', '# endregion'], 1);
    win.visibleTextEditors = [ed];
    registerDecorations({ subscriptions: [] } as any);
    expect(ed.setDecorations.mock.calls.map(c => [c[0].options.backgroundColor, c[1].length])).toEqual([['red', 1]]);
  });

  test('typing re-applies after a pause, settings changes rebuild the styles, and disposal clears them', () => {
    vi.useFakeTimers();
    mockSettings({ profile: 'subtle' });
    const ed = editor(['# ---- Sub ----']);
    win.visibleTextEditors = [ed];
    const ctx = { subscriptions: [] as any[] };
    registerDecorations(ctx as any);
    ed.setDecorations.mockClear();

    listener(ws.onDidChangeTextDocument)({});
    listener(ws.onDidChangeTextDocument)({});
    expect(ed.setDecorations).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(ed.setDecorations).toHaveBeenCalledTimes(4);

    const old = styles();
    listener(ws.onDidChangeConfiguration)({ affectsConfiguration: () => false });
    expect(styles()).toHaveLength(4);
    listener(ws.onDidChangeConfiguration)({ affectsConfiguration: (s: string) => s === 'outlineSections' });
    old.forEach((s: any) => expect(s.dispose).toHaveBeenCalled());

    ctx.subscriptions.at(-1).dispose();
    styles().forEach((s: any) => expect(s.dispose).toHaveBeenCalled());
    vi.useRealTimers();
  });
});
