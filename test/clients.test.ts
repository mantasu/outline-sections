import { vi, describe, beforeEach, test, expect } from 'vitest';
vi.mock('vscode', async () => await import('./__mocks__/vscode'));

let inspectorHandlers: Record<string, any> = {};

vi.mock('inspector', () => ({
  Session: class {
    connect = vi.fn();
    disconnect = vi.fn();
    post = vi.fn((...args: any[]) => {
      const method = args[0] as string;
      const cb = args[args.length - 1] as Function;
      if (method in inspectorHandlers) {
        const v = inspectorHandlers[method];
        v instanceof Error ? cb(v) : cb(null, v);
      } else {
        cb(null, {});
      }
    });
  },
}));

import * as vscode from 'vscode';
import * as inspector from 'inspector';
import { BaseClient } from '../src/clients/base_client';
import { CClient } from '../src/clients/c_client';
import { TypeScriptClient } from '../src/clients/ts_client';
import { PythonClient } from '../src/clients/py_client';
import { RustClient } from '../src/clients/rs_client';

/** Helper: configure the mocked inspector Session with per-method callbacks. */
function mockInspectorPost(handlers: Record<string, any>) {
  inspectorHandlers = handlers;
}

describe('clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectorHandlers = {};
    (vscode.extensions.getExtension as any).mockReset();
    (vscode.extensions.getExtension as any).mockReturnValue(null);
  });

  test('BaseClient.create initializes a subclass and sets isRunning', async () => {
    class FakeBase extends BaseClient {
      static readonly LANGUAGES = ['fake'];
      protected async getClient() {
        return {};
      }
      async fetchSymbols() {
        return [];
      }
    }

    const fake = await FakeBase.create();
    expect(fake.isRunning).toBe(true);
  });

  test('BaseClient.setupClient skips logging when debug is disabled', async () => {
    class SilentBase extends BaseClient {
      static readonly LANGUAGES = ['silent'];
      protected async getClient() {
        return null;
      }
      async fetchSymbols() {
        return [];
      }
    }

    const silent = new SilentBase() as any;
    silent.debug = false;
    await expect(silent.setupClient()).resolves.toBeUndefined();
  });

  test('CClient.toSymbol converts C/C++ symbol payloads correctly', () => {
    const payload = {
      name: 'mySymbol',
      kind: 5,
      range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
      selectionRange: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
      children: [{
        name: 'childSym',
        kind: 2,
        range: { start: { line: 4, character: 0 }, end: { line: 4, character: 1 } },
        selectionRange: { start: { line: 4, character: 0 }, end: { line: 4, character: 1 } },
      }],
    };

    const symbol = CClient.toSymbol(payload);
    expect(symbol.name).toBe('mySymbol');
    expect(symbol.children).toHaveLength(1);
    expect(symbol.children[0].name).toBe('childSym');
  });

  test('CClient.sendRequest delegates whitelist requests and returns empty symbol sets for non-whitelisted requests', async () => {
    const c = new CClient();
    (c as any).origSendRequest = vi.fn(async () => ({ symbols: [] }));

    await expect((c as any).sendRequest(CClient.WHITELIST, 'arg')).resolves.toEqual({ symbols: [] });
    expect((c as any).origSendRequest).toHaveBeenCalledWith('cpptools/getDocumentSymbols', 'arg');

    await expect((c as any).sendRequest('cpptools/getDocumentSymbols', 'arg')).resolves.toEqual({ symbols: [] });
  });

  test('TypeScriptClient.convertNavTree converts navtree structures to DocumentSymbol', () => {
    const items = [
      {
        text: 'MyClass',
        kind: 'class',
        spans: [{ start: { line: 2, offset: 1 }, end: { line: 2, offset: 7 } }],
        childItems: [{
          text: 'method',
          kind: 'method',
          spans: [{ start: { line: 3, offset: 1 }, end: { line: 3, offset: 7 } }],
        }],
      },
    ];

    const symbols = (TypeScriptClient as any).convertNavTree(items);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('MyClass');
    expect(symbols[0].children[0].name).toBe('method');
  });

  test('TypeScriptClient.execute delegates whitelist requests and supplies fallback navtree responses', async () => {
    const ts = new TypeScriptClient();
    (ts as any).origExecute = vi.fn(async (command: any, args: any, token: any, config: any) => ({ command, args, token, config }));

    await expect((ts as any).execute('navtree', {}, {})).resolves.toEqual({ type: 'response', body: { childItems: [] } });
    await expect((ts as any).execute(TypeScriptClient.WHITELIST, {}, {})).resolves.toEqual({ command: 'navtree', args: {}, token: {}, config: undefined });
  });

  test('TypeScriptClient.fetchSymbols returns converted symbols from execute output', async () => {
    const ts = new TypeScriptClient();
    const fakeBody = { childItems: [{ text: 'foo', kind: 'class', spans: [{ start: { line: 1, offset: 1 }, end: { line: 1, offset: 4 } }] }] };
    (ts as any).client = { execute: vi.fn(async () => ({ body: fakeBody })) };

    const symbols = await ts.fetchSymbols({ uri: { fsPath: '/tmp/test.ts' } } as any);
    expect(symbols[0].name).toBe('foo');
  });

  test('PythonClient.sendRequest returns an empty array for documentSymbol requests and delegates whitelist requests', async () => {
    const py = new PythonClient();
    (py as any).origSendRequest = vi.fn(async (command: any) => ({ command }));

    await expect((py as any).sendRequest('textDocument/documentSymbol', 'arg')).resolves.toEqual([]);
    await expect((py as any).sendRequest(PythonClient.WHITELIST, 'arg')).resolves.toEqual({ command: 'textDocument/documentSymbol' });
  });

  test('PythonClient.fetchSymbols uses whitelist request and returns converted symbols', async () => {
    const client = new PythonClient();
    const fakeClient = {
      sendRequest: vi.fn(async () => [
        {
          name: 'pySymbol',
          kind: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ]),
    };

    (client as any).client = fakeClient;

    const symbols = await client.fetchSymbols({ uri: { toString: () => 'file:///tmp/test.py' } } as any);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('pySymbol');
    expect(fakeClient.sendRequest).toHaveBeenCalledWith('whitelist', { textDocument: { uri: 'file:///tmp/test.py' } });
  });

  test('RustClient.getClient returns null when the extension is absent', async () => {
    const rust = new RustClient();
    expect(await (rust as any).getClient()).toBeNull();
  });

  test('CClient.getClient returns null when the extension is absent', async () => {
    const c = new CClient();
    expect(await (c as any).getClient()).toBeNull();
  });

  test('CClient.getClient can extract a running client through the cpptools probe path', async () => {
    const innerClient = { _state: 'running' };
    const map = new Map<any, any>([['k', { innerLanguageClient: innerClient }]]);
    const ext = {
      isActive: false,
      activate: vi.fn(async () => {}),
      exports: {
        registerCustomConfigurationProvider: () => map.forEach(() => {}),
      },
    };

    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const c = new CClient();
    const promise = (c as any).getClient();

    await expect(promise).resolves.toBe(innerClient);
  });

  test('CClient.fetchSymbols returns an empty symbol list from a mocked client', async () => {
    const c = new CClient();
    (c as any).client = { sendRequest: vi.fn(async () => ({ symbols: [] })) };
    const symbols = await c.fetchSymbols({ uri: { toString: () => 'file:///tmp/test.c' } } as any);
    expect(symbols).toEqual([]);
  });

  test('TypeScriptClient.getClient returns null when the extension is absent', async () => {
    const ts = new TypeScriptClient();
    expect(await (ts as any).getClient()).toBeNull();
  });

  test('RustClient inherits PythonClient constants and language registration', () => {
    expect(RustClient.LANGUAGES).toContain('rust');
    expect(RustClient.WHITELIST).toBe(PythonClient.WHITELIST);
  });

  test('CClient.sendRequest passes through to original for unrecognized request types', async () => {
    const c = new CClient();
    (c as any).origSendRequest = vi.fn(async () => 'passthrough');
    const result = await (c as any).sendRequest('other/request', 'arg');
    expect((c as any).origSendRequest).toHaveBeenCalledWith('other/request', 'arg');
    expect(result).toBe('passthrough');
  });

  test('CClient.onClientReady sets up sendRequest proxy and isRunning reflects _state', async () => {
    const c = new CClient();
    const fakeClient = { sendRequest: vi.fn(), _state: 'running' };
    (c as any).client = fakeClient;
    await (c as any).onClientReady();
    expect((c as any).origSendRequest).toBeDefined();
    expect(c.isRunning).toBe(true);
    fakeClient._state = 'stopped';
    expect(c.isRunning).toBe(false);
  });

  test('PythonClient.sendRequest passes through for unrecognized request types', async () => {
    const py = new PythonClient();
    (py as any).origSendRequest = vi.fn(async () => 'passthrough');
    const result = await (py as any).sendRequest('other/type', 'arg');
    expect(result).toBe('passthrough');
    expect((py as any).origSendRequest).toHaveBeenCalledWith('other/type', 'arg');
  });

  test('PythonClient.getClient activates extension and returns inner client', async () => {
    const fakeInner = { _state: 'running', sendRequest: vi.fn() };
    const ext = {
      isActive: false,
      activate: vi.fn(async () => {}),
      exports: { client: { getClient: () => fakeInner } },
    };
    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const result = await (new PythonClient() as any).getClient();
    expect(result).toBe(fakeInner);
    expect(ext.activate).toHaveBeenCalled();
  });

  test('PythonClient.onClientReady sets up sendRequest proxy and isRunning reflects _state', async () => {
    const py = new PythonClient();
    const fakeClient = { sendRequest: vi.fn(), _state: 'running' };
    (py as any).client = fakeClient;
    await (py as any).onClientReady();
    expect((py as any).origSendRequest).toBeDefined();
    expect(py.isRunning).toBe(true);
    fakeClient._state = 'stopped';
    expect(py.isRunning).toBe(false);
  });

  test('RustClient.getClient activates extension and returns exports.client', async () => {
    const fakeClient = { sendRequest: vi.fn() };
    const ext = {
      isActive: false,
      activate: vi.fn(async () => {}),
      exports: { client: fakeClient },
    };
    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const result = await (new RustClient() as any).getClient();
    expect(result).toBe(fakeClient);
    expect(ext.activate).toHaveBeenCalled();
  });

  test('TypeScriptClient.execute passes through to original for unrecognized commands', async () => {
    const ts = new TypeScriptClient();
    (ts as any).origExecute = vi.fn(async () => 'passthrough');
    const result = await (ts as any).execute('unknownCommand', {}, {});
    expect(result).toBe('passthrough');
    expect((ts as any).origExecute).toHaveBeenCalledWith('unknownCommand', {}, {}, undefined);
  });

  test('TypeScriptClient.getClient activates extension and returns null when plugin manager is absent', async () => {
    const ext = {
      isActive: false,
      activate: vi.fn(async () => {}),
      exports: { getAPI: () => null },
    };
    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    expect(await (new TypeScriptClient() as any).getClient()).toBeNull();
    expect(ext.activate).toHaveBeenCalled();
  });

  test('TypeScriptClient.getClient probe resolves null when inspector Runtime.enable fails', async () => {
    (vscode.extensions.getExtension as any).mockReturnValueOnce({
      isActive: true,
      exports: { getAPI: () => ({ _pluginManager: {} }) },
    });
    mockInspectorPost({ 'Runtime.enable': new Error('inspector unavailable') });
    expect(await (new TypeScriptClient() as any).getClient()).toBeNull();
  });

  test('TypeScriptClient.getClient probe resolves null when Runtime.evaluate returns no objectId', async () => {
    (vscode.extensions.getExtension as any).mockReturnValueOnce({
      isActive: true,
      exports: { getAPI: () => ({ _pluginManager: {} }) },
    });
    mockInspectorPost({
      'Runtime.enable': {},
      'Runtime.evaluate': { result: {} },
    });
    expect(await (new TypeScriptClient() as any).getClient()).toBeNull();
  });

  test('TypeScriptClient.getClient probe resolves null when Runtime.queryObjects returns no objectId', async () => {
    (vscode.extensions.getExtension as any).mockReturnValueOnce({
      isActive: true,
      exports: { getAPI: () => ({ _pluginManager: {} }) },
    });
    mockInspectorPost({
      'Runtime.enable': {},
      'Runtime.evaluate': { result: { objectId: 'oid1' } },
      'Runtime.queryObjects': { objects: {} },
    });
    expect(await (new TypeScriptClient() as any).getClient()).toBeNull();
  });

  test('TypeScriptClient.getClient probe resolves null when no matching TS client is found', async () => {
    (vscode.extensions.getExtension as any).mockReturnValueOnce({
      isActive: true,
      exports: { getAPI: () => ({ _pluginManager: {} }) },
    });
    mockInspectorPost({
      'Runtime.enable': {},
      'Runtime.evaluate': { result: { objectId: 'oid1' } },
      'Runtime.queryObjects': { objects: { objectId: 'oid2' } },
      'Runtime.callFunctionOn': {},
      'Runtime.releaseObjectGroup': new Error('cleanup failed'), // exercises .catch(() => {})
    });
    expect(await (new TypeScriptClient() as any).getClient()).toBeNull();
  });

  test('TypeScriptClient.onClientReady sets up execute proxy', async () => {
    const ts = new TypeScriptClient();
    const originalExecute = vi.fn();
    (ts as any).client = { execute: originalExecute };
    await (ts as any).onClientReady();
    expect((ts as any).origExecute).toBeDefined();
    expect((ts as any).client.execute).not.toBe(originalExecute);
  });

  test('CClient.toSymbol handles symbols without children', () => {
    const payload = {
      name: 'noKids',
      kind: 3,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      // no children field
    };
    const symbol = CClient.toSymbol(payload);
    expect(symbol.children).toEqual([]);
  });

  test('CClient.sendRequest extracts method from non-string request type', async () => {
    const c = new CClient();
    (c as any).origSendRequest = vi.fn(async () => 'ok');
    // type is an object with .method — triggers the `type?.method` branch
    const result = await (c as any).sendRequest({ method: 'other/request' }, 'arg');
    expect(result).toBe('ok');
    expect((c as any).origSendRequest).toHaveBeenCalledWith({ method: 'other/request' }, 'arg');
  });

  test('CClient.sendRequest works with debug disabled', async () => {
    const c = new CClient() as any;
    c.debug = false;
    c.origSendRequest = vi.fn(async () => 'ok');

    await expect(c.sendRequest('other/request', 'arg')).resolves.toBe('ok');
  });

  test('CClient.getClient falls back to the first non-running inner client', async () => {
    const innerClient = { _state: 'stopped' };
    const map = new Map([['k', { innerLanguageClient: innerClient }]]);
    const ext = {
      isActive: true,
      exports: {
        registerCustomConfigurationProvider: () => map.forEach(() => {}),
      },
    };

    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const c = new CClient();
    const promise = (c as any).getClient();

    await expect(promise).resolves.toBe(innerClient);
  });

  test('CClient.fetchSymbols handles a response with no symbols field', async () => {
    const c = new CClient();
    (c as any).client = { sendRequest: vi.fn(async () => ({})) };
    const symbols = await c.fetchSymbols({ uri: { toString: () => 'file:///tmp/test.c' } } as any);
    expect(symbols).toEqual([]);
  });

  test('PythonClient.sendRequest extracts method from non-string request type', async () => {
    const py = new PythonClient();
    (py as any).origSendRequest = vi.fn(async () => 'ok');
    const result = await (py as any).sendRequest({ method: 'other/type' }, 'arg');
    expect(result).toBe('ok');
  });

  test('PythonClient.sendRequest works with debug disabled', async () => {
    const py = new PythonClient() as any;
    py.debug = false;
    py.origSendRequest = vi.fn(async () => 'ok');
    await expect(py.sendRequest('other/type', 'arg')).resolves.toBe('ok');
  });

  test('PythonClient.getClient returns null when inner getClient() returns null', async () => {
    const ext = {
      isActive: true,
      exports: { client: { getClient: () => null } },
    };
    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const result = await (new PythonClient() as any).getClient();
    expect(result).toBeNull();
  });

  test('PythonClient.fetchSymbols returns empty array when response is null', async () => {
    const py = new PythonClient();
    (py as any).client = { sendRequest: vi.fn(async () => null) };
    const symbols = await py.fetchSymbols({ uri: { toString: () => 'file:///tmp/test.py' } } as any);
    expect(symbols).toEqual([]);
  });

  test('RustClient.getClient returns null when exports.client is absent', async () => {
    const ext = { isActive: true, exports: { client: null } };
    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const result = await (new RustClient() as any).getClient();
    expect(result).toBeNull();
  });

  test('TypeScriptClient.convertNavTree skips items without spans', () => {
    const items = [{ text: 'NoSpan', kind: 'class' }]; // no spans array
    const symbols = (TypeScriptClient as any).convertNavTree(items);
    expect(symbols).toHaveLength(0);
  });

  test('TypeScriptClient.fetchSymbols returns empty array when execute returns null', async () => {
    const ts = new TypeScriptClient();
    (ts as any).client = { execute: vi.fn(async () => null) };
    const symbols = await ts.fetchSymbols({ uri: { fsPath: '/tmp/test.ts' } } as any);
    expect(symbols).toEqual([]);
  });

  test('TypeScriptClient.execute works with debug disabled', async () => {
    const ts = new TypeScriptClient() as any;
    ts.debug = false;
    ts.origExecute = vi.fn(async () => 'ok');
    await expect(ts.execute('unknownCommand', {}, {})).resolves.toBe('ok');
  });

  test('TypeScriptClient.convertNavTree uses empty string when item.text is absent', () => {
    const items = [{
      kind: 'class',
      spans: [{ start: { line: 1, offset: 1 }, end: { line: 1, offset: 4 } }],
      // no text or kindModifiers
    }];
    const symbols = (TypeScriptClient as any).convertNavTree(items);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('');
  });

  test('CClient.getClient returns null when all inner clients are absent from the map', async () => {
    // innerLanguageClient is null → filter(Boolean) gives [] → ?? null path
    const map = new Map([['k', { innerLanguageClient: null }]]);
    const ext = {
      isActive: true,
      exports: {
        registerCustomConfigurationProvider: () => map.forEach(() => {}),
      },
    };

    (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
    const c = new CClient();
    const promise = (c as any).getClient();

    await expect(promise).resolves.toBeNull();
  });

  test('CClient.getClient probe handles map entries without innerLanguageClient on first value', async () => {
    vi.useFakeTimers();
    try {
      const map = new Map<any, any>([['k', { notClient: true }]]);
      const ext = {
        isActive: true,
        exports: {
          registerCustomConfigurationProvider: () => map.forEach(() => {}),
        },
      };

      (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
      const c = new CClient();
      const promise = (c as any).getClient();
      vi.advanceTimersByTime(2001);

      await expect(promise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('CClient.getClient timer callback can run after probe resolution', async () => {
    vi.useFakeTimers();
    try {
      const map = new Map<any, any>([['k', { innerLanguageClient: { _state: 'running' } }]]);
      const ext = {
        isActive: true,
        exports: { registerCustomConfigurationProvider: () => map.forEach(() => {}) },
      };

      (vscode.extensions.getExtension as any).mockReturnValueOnce(ext);
      const c = new CClient();
      const promise = (c as any).getClient();
      await expect(promise).resolves.toEqual({ _state: 'running' });

      vi.advanceTimersByTime(2001);
    } finally {
      vi.useRealTimers();
    }
  });
});
