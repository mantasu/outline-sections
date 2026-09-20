// Level 1 - a closed region grouping two functions (q nests a closure)

// region HHH

function p(): number {
  return 1;
}

function q(): () => object {
  const state = {};

  function r(): object {
    return state;
  }
  return r;
}

// endregion


// Level 2 - deep nesting A > AA > AAA with an inner closed region

namespace A {
  export namespace AA {
    export class AAA {
      // region HHH
      a(): boolean {
        return true;
      }
      // endregion
    }
  }
}


// Level 3 - a 3-line header inside a class is bounded by the class scope

class B {
  /* ---------------------------------------------------------------------------- */
  /*                                  H                                    */
  /* ---------------------------------------------------------------------------- */
  b(): number {
    return 1;
  }
}


// Level 4 - trailing banners attach by indentation inside a class body

namespace C {
  class CA {
    x = 0;
    /* ---- HH ---- */
  }

  class CB {
    y = 0;
    /* ---- HH ---- */
  }

  class CC {
    z = 0;
  }
  /* ---- HH ---- */
}


// Level 5 - a banner inside a class's reported range belongs to the class even
// when it is written at a shallower indent than the class body

namespace D {
  class DA {
    /* ---- HH ---- */
    w = 0;
  }
}


// Level 6 - multi-line signatures: a deeper trailing banner is inside the
// method, a same-indent banner is a sibling inside the enclosing class

class M {
  s(
    p1: number,
    p2: number,
  ): number {
    return p1;
    /* ---- HH ---- */
  }

  t(
    p1: number,
    p2: number,
  ): void { }
  /* ---- HH ---- */
}


// Level 7 - inside a class, a subheader groups the sibling methods that follow
// it; a banner deep in a method body stays inside that method

class N {
  na(): number {
    return 1;
    /* ---- HH ---- */
  }
  nb(): number {
    return 1;
  }
  /* ---- HH ---- */
  nc(): number {
    return 1;
  }
  /* ---- HH ---- */
  nd(): number {
    return 1;
  }
}


// Level 8 - a class declared inside a method: a same-indent trailing banner is a
// sibling of the inner class, a deeper one lands inside it

class P {
  pa(): number {
    class PP { }
    /* ---- HH ---- */
    return 1;
  }
  pb(): void {
    class PQ {
      /* ---- HH ---- */
    }
  }
}


// Level 9 - a 3-line header opening a class captures every following method, and
// a trailing subheader lands under that open header

class R {
  /* ---------------------------------------------------------------------------- */
  /*                             H                             */
  /* ---------------------------------------------------------------------------- */
  ra(): number {
    return 1;
  }
  rb(
    p1: number,
    p2: number,
  ): void {
    return;
    /* ---- HH ---- */
  }
  rc(): void { }
  /* ---- HH ---- */
}


// Level 10 - a top-level subheader cascades over the classes that follow it

class E {
  e(): number {
    return 1;
  }
  /* ---- HH ---- */
}
/* ---- HH ---- */


class F {
  f(): number {
    return 1;
  }
}
/* ---- HH ---- */


class G {
  g(): number {
    return 1;
  }
}


// Level 11 - a greedy trailing header adopts an open region, and a malformed
// tail must not crash the parser

/* ---------------------------------------------------------------------------- */
/*                             H                             */
/* ---------------------------------------------------------------------------- */

// region HHH

function unbounded(): number {
  return 1;
}

/* ---- HH ---- */
function broken(a: number, b: number {
  return a + b;
}
