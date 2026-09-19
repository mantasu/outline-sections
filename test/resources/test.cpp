// region handlers

int on_load() {
    return 1;
}

int on_save() {
    int state = 0;

    auto persist = [state]() {
        return state;
    };
    return state;
}

// endregion

namespace deep {
    namespace middle {
        class Inner {
        public:
            // region innermost
            bool run() {
                return true;
            }
            // endregion
        };
    }
}

class Cart {
public:
    void add(int item) {
        items.push_back(item);
    }
    /* ---- Cart internals ---- */
private:
    std::vector<int> items;
};
/* ---- Outside Cart ---- */

class Inventory {
public:
    class Reserved {
    public:
        int count = 0;
        /* ---- Reserved detail ---- */
    };

    /* ---------------------------------------------------------------------------- */
    /*                              Inventory Section A                             */
    /* ---------------------------------------------------------------------------- */

    class Stock {
    public:
        int count = 0;
    };
    /* ---- Inventory Section B ---- */
        /* ---- Inventory Section C ---- */

    class Ledger {
    public:
        int count = 0;
    };
    /* ---- Inventory Section D ---- */

    class Audit {
    /* ---- Audit inline ---- */
    public:
        int count = 0;
    };
};
/* ---- Outside Inventory ---- */

class Config {
public:
    /* ---------------------------------------------------------------------------- */
    /*                                Config Header                                 */
    /* ---------------------------------------------------------------------------- */
    Config(std::string name) : name(name) {}
private:
    std::string name;
};

/* ---------------------------------------------------------------------------- */
/*                             Trailing Region Demo                             */
/* ---------------------------------------------------------------------------- */

// region open_ended

int unbounded_one() {
    return 1;
}

/* ---- Malformed tail (should not crash the parser) ---- */
int broken(int a, int b {
    return a + b;
}

