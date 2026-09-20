// Level 1 - a closed region grouping two functions (q nests a closure)

// region HHH

fn p() -> i32 {
    1
}

fn q() -> impl Fn() -> i32 {
    let state = 0;

    fn r() -> i32 {
        state
    }
    move || state
}

// endregion


// Level 2 - deep nesting A > AA > AAA with an inner closed region

mod A {
    mod AA {
        mod AAA {
            // region HHH
            fn a() -> bool {
                true
            }
            // endregion
        }
    }
}


// Level 3 - a 3-line header inside a block is bounded by the block scope

impl B {
    /* ---------------------------------------------------------------------------- */
    /*                                  H                                    */
    /* ---------------------------------------------------------------------------- */
    fn b(&self) -> i32 {
        1
    }
}


// Level 4 - trailing banners attach by indentation inside a module body

mod C {
    struct CA {
        x: i32,
        /* ---- HH ---- */
    }

    struct CB {
        y: i32,
        /* ---- HH ---- */
    }

    struct CC {
        z: i32,
    }
    /* ---- HH ---- */
}


// Level 5 - a banner inside a block's reported range belongs to the block even
// when it is written at a shallower indent than the block body

mod D {
    struct DA {
/* ---- HH ---- */
        w: i32,
    }
}


// Level 6 - multi-line signatures: a deeper trailing banner is inside the
// method, a same-indent banner is a sibling inside the enclosing block

impl M {
    fn s(
        &self,
        p1: i32,
    ) -> i32 {
        p1
        /* ---- HH ---- */
    }

    fn t(
        &self,
        p1: i32,
    ) {}
    /* ---- HH ---- */
}


// Level 7 - inside a block, a subheader groups the sibling methods that follow
// it; a banner deep in a method body stays inside that method

impl N {
    fn na(&self) -> i32 {
        1
        /* ---- HH ---- */
    }
    fn nb(&self) -> i32 {
        1
    }
    /* ---- HH ---- */
    fn nc(&self) -> i32 {
        1
    }
/* ---- HH ---- */
    fn nd(&self) -> i32 {
        1
    }
}


// Level 8 - a block declared inside a method: a same-indent trailing banner is a
// sibling of the inner block, a deeper one lands inside it

impl P {
    fn pa(&self) -> i32 {
        struct PP {}
        /* ---- HH ---- */
        1
    }
    fn pb(&self) {
        struct PQ {
            /* ---- HH ---- */
        }
    }
}


// Level 9 - a 3-line header opening a block captures every following method, and
// a trailing subheader lands under that open header

impl R {
    /* ---------------------------------------------------------------------------- */
    /*                             H                             */
    /* ---------------------------------------------------------------------------- */
    fn ra(&self) -> i32 {
        1
    }
    fn rb(
        &self,
        p1: i32,
    ) {
        /* ---- HH ---- */
    }
    fn rc(&self) {}
    /* ---- HH ---- */
}


// Level 10 - a top-level subheader cascades over the blocks that follow it

impl E {
    fn e(&self) -> i32 {
        1
    }
    /* ---- HH ---- */
}
/* ---- HH ---- */


impl F {
    fn f(&self) -> i32 {
        1
    }
}
/* ---- HH ---- */


impl G {
    fn g(&self) -> i32 {
        1
    }
}


// Level 11 - a greedy trailing header adopts an open region, and a malformed
// tail must not crash the parser

/* ---------------------------------------------------------------------------- */
/*                             H                             */
/* ---------------------------------------------------------------------------- */

// region HHH

fn unbounded() -> i32 {
    1
}

/* ---- HH ---- */
fn broken(a: i32, b: i32 {
    a + b
}
