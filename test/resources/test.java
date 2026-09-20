// Level 1 - a closed region grouping a class and its method

// region HHH

class A {
    int a() {
        return 1;
    }
}

// endregion

// Level 2 - deep nesting B > BA > BAA with an inner closed region

class B {
    class BA {
        class BAA {
            // region HHH
            boolean b() {
                return true;
            }
            // endregion
        }
    }
}

// Level 3 - a 3-line header inside a class is bounded by the class scope

class C {
    /* ---------------------------------------------------------------------- */
    /* H */
    /* ---------------------------------------------------------------------- */
    int c() {
        return 1;
    }
}

// Level 4 - trailing banners attach by indentation inside a class body

class D {
    class DA {
        int x = 0;
        /* ---- HH ---- */
    }

    class DB {
        int y = 0;
    }
    /* ---- HH ---- */
}

// Level 5 - a subheader groups the sibling methods that follow it inside a
// class;
// a banner deep in a method body stays inside that method

class E {
    void ea() {
        return;
        /* ---- HH ---- */
    }

    void eb() {
    }

    /* ---- HH ---- */
    void ec() {
    }
}

// Level 6 - a 3-line header opening a class captures every following method,
// and
// a trailing subheader lands under that open header

class F {
    /* ---------------------------------------------------------------------- */
    /* H */
    /* ---------------------------------------------------------------------- */
    int fa() {
        return 1;
    }

    void fb() {
        return;
        /* ---- HH ---- */
    }
}

// Level 7 - a top-level subheader cascades over the classes that follow it

class G {
    int g() {
        return 1;
    }
    /* ---- HH ---- */
}
/* ---- HH ---- */

class I {
    int i() {
        return 1;
    }
}

// Level 8 - a greedy trailing header adopts an open region at end of file

/* ---------------------------------------------------------------------- */
/* H */
/* ---------------------------------------------------------------------- */

// region HHH

class J {
    int j() {
        return 1;
    }
}
