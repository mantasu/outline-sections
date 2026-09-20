// Level 1 - a closed region grouping two functions (q nests a closure)

// region HHH

int p() {
  return 1;
}

auto q() {
  int state = 0;

  auto r = [&]() {
    return state;
  };
  return r;
}

// endregion


// Level 2 - deep nesting A > AA > AAA with an inner closed region

namespace A {
  namespace AA {
    class AAA {
      // region HHH
      bool a() {
        return true;
      }
      // endregion
    };
  }
}


// Level 3 - a 3-line header inside a class is bounded by the class scope

class B {
  /* ---------------------------------------------------------------------------- */
  /*                                  H                                    */
  /* ---------------------------------------------------------------------------- */
  int b() {
    return 1;
  }
};


// Level 4 - trailing banners attach by indentation inside a class body

namespace C {
  class CA {
    int x;
    /* ---- HH ---- */
  };

  class CB {
    int y;
    /* ---- HH ---- */
  };

  class CC {
    int z;
  };
  /* ---- HH ---- */
}


// Level 5 - a banner inside a class's reported range belongs to the class even
// when it is written at a shallower indent than the class body

namespace D {
  class DA {
/* ---- HH ---- */
    int w;
  };
}


// Level 6 - multi-line signatures: a deeper trailing banner is inside the
// method, a same-indent banner is a sibling inside the enclosing class

class M {
  int s(
    int p1,
    int p2
  ) {
    return p1;
    /* ---- HH ---- */
  }

  void t(
    int p1,
    int p2
  ) {}
  /* ---- HH ---- */
};


// Level 7 - inside a class, a subheader groups the sibling methods that follow
// it; a banner deep in a method body stays inside that method

class N {
  int na() {
    return 1;
    /* ---- HH ---- */
  }
  int nb() {
    return 1;
  }
  /* ---- HH ---- */
  int nc() {
    return 1;
  }
/* ---- HH ---- */
  int nd() {
    return 1;
  }
};


// Level 8 - a class declared inside a method: a same-indent trailing banner is a
// sibling of the inner class, a deeper one lands inside it

class P {
  int pa() {
    class PP {};
    /* ---- HH ---- */
    return 1;
  }
  void pb() {
    class PQ {
      /* ---- HH ---- */
    };
  }
};


// Level 9 - a 3-line header opening a class captures every following method, and
// a trailing subheader lands under that open header

class R {
  /* ---------------------------------------------------------------------------- */
  /*                             H                             */
  /* ---------------------------------------------------------------------------- */
  int ra() {
    return 1;
  }
  void rb(
    int p1,
    int p2
  ) {
    /* ---- HH ---- */
  }
  void rc() {}
  /* ---- HH ---- */
};


// Level 10 - a top-level subheader cascades over the classes that follow it

class E {
  int e() {
    return 1;
  }
  /* ---- HH ---- */
};
/* ---- HH ---- */


class F {
  int f() {
    return 1;
  }
};
/* ---- HH ---- */


class G {
  int g() {
    return 1;
  }
};


// Level 11 - a greedy trailing header adopts an open region, and a malformed
// tail must not crash the parser

/* ---------------------------------------------------------------------------- */
/*                             H                             */
/* ---------------------------------------------------------------------------- */

// region HHH

int unbounded() {
  return 1;
}

/* ---- HH ---- */
int broken(int a, int b {
  return a + b;
}
