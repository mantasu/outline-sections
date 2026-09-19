# region Utilities

def helper_one():
    return 1


def helper_two():
    inner_state = {}

    def closure():
        return inner_state
    return closure

# endregion


class Deep:
    class Middle:
        class Inner:
            # region innermost
            def deep(self):
                return True
            # endregion


class Account:
    def __init__(self, name: str):
        self.name = name
    # ---- Account internals ----
# ---- Outside Account ----


class Ledger:
    class Entries:
        pass
        # ---- Entries detail ----
# ---------------------------------------------------------------------------- #
#                               Ledger Section A                               #
# ---------------------------------------------------------------------------- #

    class Totals:
        pass
# ---- Ledger Section B ----
        # ---- Ledger Section C ----

    class Snapshot: pass
        # ---- Ledger Section D ----

    class Audit:
# ---- Audit inline ----
        pass

# ---- Outside Ledger ----


class Profile:
    # ---------------------------------------------------------------------------- #
    #                               Profile Header                                 #
    # ---------------------------------------------------------------------------- #
    def __init__(self, name: str):
        self.name = name


# ---------------------------------------------------------------------------- #
#                             Trailing Region Demo                             #
# ---------------------------------------------------------------------------- #

# region OpenEnded

def unbounded_one():
    return 1

# ---- Malformed tail (should not crash the parser) ----
def broken(
    a,
    b
    return a + b
