import { vi, describe, beforeEach, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { registerDecorations } from '../src/decorations';
import { makeDoc, mockSettings } from './helpers';

const win = vscode.window as any, ws = vscode.workspace as any;
const listener = (event: any) => event.mock.calls.at(-1)[0];
const styles = () => win.createTextEditorDecorationType.mock.results.map((r: any) => r.value);
const editor = (lines: string[]) => ({ document: makeDoc('python', lines), setDecorations: vi.fn() });

describe('decorations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    win.visibleTextEditors = [];
  });

  test('styles each section kind and decorates the full lines of its markers', () => {
    mockSettings({ color: true, scrollbar: true, gutter: true });
    const ed = editor(['# ----', '# Header', '# ----', '# ---- Sub ----', '# region R', '# endregion']);
    win.visibleTextEditors = [ed];
    const ctx = { subscriptions: [] as any[] };
    registerDecorations(ctx as any);

    const [header, subheader, region] = styles();
    expect(header.options).toMatchObject({ color: { id: 'outlineSections.headerForeground' }, fontWeight: 'bold', fontStyle: 'italic' });
    expect(subheader.options.overviewRulerColor.id).toBe('outlineSections.subheaderForeground');
    expect(region.options.gutterIconPath.toString()).toMatch(/^data:image\/svg\+xml;base64,/);

    const ranges = (style: any) => ed.setDecorations.mock.calls.find(c => c[0] === style)![1]
      .map((r: any) => [r.start.line, r.end.line, r.end.character]);
    expect(ranges(header)).toEqual([[0, 2, 6]]);
    expect(ranges(subheader)).toEqual([[3, 3, 15]]);
    expect(ranges(region)).toEqual([[4, 4, 10], [5, 5, 11]]);
    expect(ctx.subscriptions).toHaveLength(4);
  });

  test('nothing is decorated while turned off, and settings changes rebuild the styles', () => {
    mockSettings();
    const ed = editor(['# ---- Sub ----']);
    win.visibleTextEditors = [ed];
    registerDecorations({ subscriptions: [] } as any);
    expect(ed.setDecorations).not.toHaveBeenCalled();
    expect(styles()[0].options).toEqual({});

    const old = styles();
    mockSettings({ color: true });
    listener(ws.onDidChangeConfiguration)({ affectsConfiguration: (s: string) => s === 'outlineSections' });
    old.forEach((s: any) => expect(s.dispose).toHaveBeenCalled());
    expect(ed.setDecorations).toHaveBeenCalledTimes(3);

    listener(ws.onDidChangeConfiguration)({ affectsConfiguration: () => false });
    expect(win.createTextEditorDecorationType).toHaveBeenCalledTimes(6);
  });

  test('typing re-applies after a pause, editor switches at once, and disposal clears the styles', () => {
    vi.useFakeTimers();
    mockSettings({ color: true });
    const ed = editor(['# ---- Sub ----']);
    win.visibleTextEditors = [ed];
    const ctx = { subscriptions: [] as any[] };
    registerDecorations(ctx as any);
    ed.setDecorations.mockClear();

    listener(ws.onDidChangeTextDocument)({});
    listener(ws.onDidChangeTextDocument)({});
    expect(ed.setDecorations).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(ed.setDecorations).toHaveBeenCalledTimes(3);

    listener(win.onDidChangeVisibleTextEditors)([ed]);
    expect(ed.setDecorations).toHaveBeenCalledTimes(6);

    ctx.subscriptions.at(-1).dispose();
    styles().forEach((s: any) => expect(s.dispose).toHaveBeenCalled());
    vi.useRealTimers();
  });
});
