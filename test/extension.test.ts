import { vi, describe, beforeEach, test, expect, type Mock } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));
import * as vscode from 'vscode';
import { activate, deactivate, getClient, provideSymbols, refreshSymbols } from '../src/extension';
import { PythonClient } from '../src/clients/py_client';

describe('extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const workspace = vscode.workspace as any;
    workspace.textDocuments = [];
  });

  test('activate registers document symbol providers for supported languages', () => {
    const ctx = { subscriptions: [] } as any;

    activate(ctx);

    expect(vscode.languages.registerDocumentSymbolProvider).toHaveBeenCalled();
    expect(ctx.subscriptions.length).toBeGreaterThan(0);
  });

  test('refreshSymbols edits matching documents and reverts if not dirty', async () => {
    const doc = {
      languageId: 'python',
      isDirty: false,
      save: vi.fn(async () => {}),
      uri: { toString: () => 'file:///tmp/test.py' },
    } as any;

    (vscode.workspace as any).textDocuments = [doc];
    await expect(refreshSymbols('python')).resolves.toBeUndefined();
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(doc, { preserveFocus: true, preview: false });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.action.files.revert");
  });

  test('refreshSymbols does not save already dirty documents', async () => {
    const doc = {
      languageId: 'python',
      isDirty: true,
      save: vi.fn(async () => {}),
      uri: { toString: () => 'file:///tmp/dirty.py' },
    } as any;

    (vscode.workspace as any).textDocuments = [doc];
    await expect(refreshSymbols('python')).resolves.toBeUndefined();
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('refreshSymbols swallows chain errors internally so later calls still run', async () => {
    const doc = {
      languageId: 'python',
      isDirty: false,
      save: vi.fn(async () => {}),
      uri: { toString: () => 'file:///tmp/err.py' },
    } as any;
    (vscode.workspace as any).textDocuments = [doc];

    (vscode.window.showTextDocument as any).mockRejectedValueOnce(new Error('boom'));
    await expect(refreshSymbols('python')).rejects.toThrow('boom');

    (vscode.window.showTextDocument as any).mockResolvedValueOnce({
      edit: async (cb: any) => { cb({ insert: () => {}, delete: () => {} }); return true; },
    });
    await expect(refreshSymbols('python')).resolves.toBeUndefined();
  });

  test('getClient returns null for unsupported languages', async () => {
    const clients = new Map<string, any>();
    await expect(getClient(clients, 'unknownlang')).resolves.toBeNull();
    expect(clients.get('unknownlang')).toBeNull();
  });

  test('provideSymbols returns an empty tree when no client exists', async () => {
    const doc = {
      languageId: 'unknownlang',
      uri: { toString: () => 'file:///tmp/test.txt' },
      lineCount: 0,
      lineAt: (_: number) => ({ text: '' }),
      getText: () => '',
    } as any;

    const tree = await provideSymbols(new Map(), doc);
    expect(tree).toEqual([]);
  });

  test('provideSymbols logs debug output when a client is available', async () => {
    const doc = {
      languageId: 'python',
      fileName: 'test.py',
      uri: { toString: () => 'file:///tmp/test.py' },
      lineCount: 0,
      lineAt: (_: number) => ({ text: '' }),
      getText: () => '',
    } as any;

    const client = {
      isRunning: true,
      debug: true,
      constructor: { name: 'FakeClient' },
      fetchSymbols: vi.fn(async () => []),
    };

    const tree = await provideSymbols(new Map([['python', client]]), doc);
    expect(tree).toEqual([]);
    expect(client.fetchSymbols).toHaveBeenCalledWith(doc);
  });

  test('provideSymbols returns tree without debug logging when client.debug is false', async () => {
    const doc = {
      languageId: 'python',
      fileName: 'test.py',
      uri: { toString: () => 'file:///tmp/test.py' },
      lineCount: 0,
      lineAt: (_: number) => ({ text: '' }),
      getText: () => '',
    } as any;

    const client = {
      isRunning: true,
      debug: false,
      fetchSymbols: vi.fn(async () => []),
    };

    const tree = await provideSymbols(new Map([['python', client]]), doc);
    expect(tree).toEqual([]);
    expect(client.fetchSymbols).toHaveBeenCalledWith(doc);
  });

  test('deactivate is a no-op', () => {
    expect(deactivate()).toBeUndefined();
  });

  test('getClient returns a cached running client immediately without creating a new instance', async () => {
    const runningClient = { isRunning: true } as any;
    const clients = new Map([['python', runningClient]]);
    const result = await getClient(clients, 'python');
    expect(result).toBe(runningClient);
  });

  test('getClient creates a new client instance for a supported language', async () => {
    const clients = new Map<string, any>();
    const result = await getClient(clients, 'python');
    // Extension not found → PythonClient created but isRunning=false → returns null
    expect(result).toBeNull();
    expect(clients.has('python')).toBe(true);
  });

  test('getClient returns a newly created running client', async () => {
    const fakeRunning = { isRunning: true } as any;
    vi.spyOn(PythonClient, 'create').mockResolvedValueOnce(fakeRunning);
    const clients = new Map<string, any>();
    const result = await getClient(clients, 'python');
    expect(result).toBe(fakeRunning);
    vi.restoreAllMocks();
  });

  test('provideDocumentSymbols callback registered by activate invokes provideSymbols', async () => {
    const ctx = { subscriptions: [] as any[] } as any;
    activate(ctx);

    // Retrieve the first registered provider callback
    const provider = (vscode.languages.registerDocumentSymbolProvider as Mock).mock.calls[0][1];
    const doc = {
      languageId: 'python',
      fileName: 'test.py',
      uri: { toString: () => 'file:///tmp/test.py' },
      lineCount: 0,
      lineAt: (_: number) => ({ text: '' }),
      getText: () => '',
    } as any;

    const result = await provider.provideDocumentSymbols(doc);
    expect(Array.isArray(result)).toBe(true);
  });
});
