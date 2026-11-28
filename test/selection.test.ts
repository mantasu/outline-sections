import { vi, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { registerSelection } from '../src/selection';
import { makeDoc, mockSettings } from './helpers';

test('Expand Selection steps through the sections around each position', () => {
  mockSettings();
  const ctx = { subscriptions: [] as any[] };
  registerSelection(ctx as any);
  const [selector, provider] = (vscode.languages.registerSelectionRangeProvider as any).mock.calls.at(-1);

  const doc = makeDoc('python', ['import os', '# ====', '# Banner', '# ====', '# ---- Div ----', 'x = 1']);
  const [inside, outside] = provider.provideSelectionRanges(doc, [new vscode.Position(5, 2), new vscode.Position(0, 3)]);
  const lines = (r: vscode.SelectionRange) => [r.range.start.line, r.range.start.character, r.range.end.line, r.range.end.character];

  expect(lines(inside)).toEqual([4, 0, 5, 5]);
  expect(lines(inside.parent)).toEqual([1, 0, 5, 5]);
  expect(inside.parent.parent).toBeUndefined();
  expect([lines(outside), outside.parent]).toEqual([[0, 3, 0, 3], undefined]);
  expect([selector, ctx.subscriptions.length]).toEqual(['*', 1]);
});
