// region Handlers

export function onLoad(): void {
  console.log("loaded");
}

export function onSave(): void {
  const state = {};

  function persist() {
    return state;
  }
  return persist;
}

// endregion

namespace Deep {
  export namespace Middle {
    export class Inner {
      // region innermost
      run(): boolean {
        return true;
      }
      // endregion
    }
  }
}

namespace Shop {
  export class Cart {
    private items: string[] = [];

    add(item: string): void {
      this.items.push(item);
    }
    /* ---- Cart internals ---- */
  }

  /* ---- Outside Cart ---- */

  export class Inventory {
    class Reserved {
      count = 0;
      /* ---- Reserved detail ---- */
    }

    /* ---------------------------------------------------------------------------- */
    /*                              Inventory Section A                             */
    /* ---------------------------------------------------------------------------- */

    class Stock {
      count = 0;
    }
    /* ---- Inventory Section B ---- */
      /* ---- Inventory Section C ---- */

    class Ledger {
      count = 0;
    }
    /* ---- Inventory Section D ---- */

    class Audit {
    /* ---- Audit inline ---- */
      count = 0;
    }
  }
  /* ---- Outside Inventory ---- */
}

class Config {
  /* ---------------------------------------------------------------------------- */
  /*                                Config Header                                 */
  /* ---------------------------------------------------------------------------- */
  constructor(public name: string) {}
}

/* ---------------------------------------------------------------------------- */
/*                             Trailing Region Demo                             */
/* ---------------------------------------------------------------------------- */

// region OpenEnded

export function unboundedOne(): number {
  return 1;
}

/* ---- Malformed tail (should not crash the parser) ---- */
function broken(a: number, b: number {
  return a + b;
}

