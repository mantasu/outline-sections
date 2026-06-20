
import * as vscode from "vscode";

/**
 * Returns the element with the smallest score.
 *
 * Iterates over the array and picks the element with the lowest value
 * returned by the scoring function. Returns `null` if empty.
 *
 * @template T - Type of elements in the array.
 *
 * @param arr - The input array to search through.
 * @param fn - A scoring function that returns a numeric value for each element.
 *
 * @returns The element with the smallest score, or `null` if the array is empty.
 *
 * @example
 * Basic usage with numbers:
 * ```ts
 * minBy([1, 2, 3], x => x); // 1
 * ```
 *
 * @example
 * Finding shortest string:
 * ```ts
 * minBy(["apple", "hi", "banana"], s => s.length); // "hi"
 * ```
 */
export function minBy<T>(arr: T[], fn: (x: T) => number): T | null {
  return arr.reduce<T | null>((a, c) => (!a || fn(c) < fn(a) ? c : a), null);
}


/**
 * Converts an LSP range or TypeScript NavTree span into a VS Code range.
 *
 * Supports:
 * - LSP ranges with `{ start: { line, character }, end: { line, character } }`
 * - TypeScript NavTree spans with `{ start: { line, offset }, end: { line, offset } }`
 *
 * NavTree positions are 1-based and are converted to VS Code's 0-based
 * coordinates. LSP ranges are assumed to already use 0-based coordinates.
 *
 * @param x - The range-like object to convert.
 *
 * @returns A normalized VS Code range.
 *
 * @example
 * LSP range:
 * ```ts
 * toRange({ start: {line: 5, character: 10}, end: {line: 5, character: 20} });
 * ```
 *
 * @example
 * TypeScript NavTree span:
 * ```ts
 * toRange({ start: {line: 6, offset: 11}, end: {line: 6, offset: 21} });
 * ```
 */
export function toRange(x: any): vscode.Range {
  const offset = "offset" in x.start ? 1 : 0;

  return new vscode.Range(
    x.start.line - offset,
    (x.start.offset ?? x.start.character) - offset,
    x.end.line - offset,
    (x.end.offset ?? x.end.character) - offset,
  );
}


/**
 * Maps a TypeScript server navigation item kind string to a VS Code {@link vscode.SymbolKind}.
 *
 * TSServer returns `kind` as a plain string (e.g. `"class"`, `"method"`) on
 * {@link Proto.NavigationTree} nodes. VS Code's document-symbol API expects a
 * {@link vscode.SymbolKind} enum value. This function bridges the two.
 *
 * Unmapped kinds fall back to {@link vscode.SymbolKind.Variable} to match the
 * behaviour of the built-in `typescript-language-features` extension.
 *
 * @param kind - The `kind` string from a TSServer `NavigationTree` node.
 * @returns The closest matching {@link vscode.SymbolKind}.
 *
 * @example
 * Basic class mapping:
 * ```ts
 * navKindToSymbolKind('class'); // vscode.SymbolKind.Class
 * ```
 * 
 * @see https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/typeConverters.ts#L109
 */
export function navKindToSymbolKind(kind: string): vscode.SymbolKind {
    switch (kind) {
        // Structural & organisational
        case "internal module": // legacy TS namespace syntax
        case "module":          return vscode.SymbolKind.Module;  
        case "namespace":       return vscode.SymbolKind.Namespace;

        // Type declarations
        case "class":           return vscode.SymbolKind.Class;
        case "interface":       return vscode.SymbolKind.Interface;
        case "enum":            return vscode.SymbolKind.Enum;
        case "enumMember":      return vscode.SymbolKind.EnumMember;
        case "type":            return vscode.SymbolKind.TypeParameter;
        case "type parameter":  return vscode.SymbolKind.TypeParameter;

        // Callables
        case "local function":
        case "function":        return vscode.SymbolKind.Function;
        case "getter":          // get accessor
        case "setter":          // set accessor
        case "index":           // index signature  [ ]
        case "call":            // call signature   ( )
        case "construct":       // construct signature  new( )
        case "method":          return vscode.SymbolKind.Method;
        case "constructor":     return vscode.SymbolKind.Constructor;

        // Variables & bindings
        case "alias":           // import alias / re-export
        case "let":
        case "const":
        case "local var":
        case "var":             return vscode.SymbolKind.Variable;

        // Object members
        case "member":          // generic member (e.g. object-literal shorthand)
        case "property":        return vscode.SymbolKind.Property;

        // Primitives that tsserver surfaces as kinds
        case "string":          return vscode.SymbolKind.String;
        case "number":          return vscode.SymbolKind.Number;
        case "boolean":         return vscode.SymbolKind.Boolean;
        case "null":            return vscode.SymbolKind.Null;
        case "array":           return vscode.SymbolKind.Array;

        // Structured data
        case "object":          return vscode.SymbolKind.Object;
        case "key":             return vscode.SymbolKind.Key;
        case "struct":          return vscode.SymbolKind.Struct;

        // Catch all
        default:                return vscode.SymbolKind.Variable;
    }
}