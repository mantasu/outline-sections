// region handlers

pub fn on_load() {
    println!("loaded");
}

pub fn on_save() {
    let state = 0;

    fn persist(state: u32) -> u32 {
        state
    }
}

// endregion

mod deep {
    pub mod middle {
        pub mod inner {
            // region innermost
            pub fn run() -> bool {
                true
            }
            // endregion
        }
    }
}

mod shop {
    pub struct Cart {
        items: Vec<String>,
    }

    impl Cart {
        pub fn add(&mut self, item: String) {
            self.items.push(item);
        }
        /* ---- Cart internals ---- */
    }

    /* ---- Outside Cart ---- */

    pub struct Inventory {
        count: u32,
    }

    impl Inventory {
        mod reserved {
            pub const COUNT: u32 = 0;
            /* ---- Reserved detail ---- */
        }

        /* ---------------------------------------------------------------------------- */
        /*                              Inventory Section A                              */
        /* ---------------------------------------------------------------------------- */

        mod stock {
            pub const COUNT: u32 = 0;
        }
        /* ---- Inventory Section B ---- */
            /* ---- Inventory Section C ---- */

        mod ledger {
            pub const COUNT: u32 = 0;
        }
        /* ---- Inventory Section D ---- */

        mod audit {
        /* ---- Audit inline ---- */
            pub const COUNT: u32 = 0;
        }
    }
    /* ---- Outside Inventory ---- */
}

struct Config {
    name: String,
}

impl Config {
    /* ---------------------------------------------------------------------------- */
    /*                                Config Header                                 */
    /* ---------------------------------------------------------------------------- */
    pub fn new(name: String) -> Config {
        Config { name }
    }
}

/* ---------------------------------------------------------------------------- */
/*                             Trailing Region Demo                             */
/* ---------------------------------------------------------------------------- */

// region open_ended

pub fn unbounded_one() -> i32 {
    1
}

/* ---- Malformed tail (should not crash the parser) ---- */
fn broken(a: i32, b: i32 {
    a + b
}

