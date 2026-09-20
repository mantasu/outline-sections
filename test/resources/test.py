# Level 1 - a closed region grouping two functions (q nests a closure)

# region HHH

def p():
    return 1


def q():
    state = {}

    def r():
        return state
    return r

# endregion


# Level 2 - deep class nesting A > AA > AAA with an inner closed region

class A:
    class AA:
        class AAA:
            # region HHH
            def a(self):
                return True
            # endregion


# Level 3 - a 3-line header inside a class is bounded by the class scope

class B:
    # ---------------------------------------------------------------------------- #
    #                                  H                                    #
    # ---------------------------------------------------------------------------- #
    def b(self):
        return 1


# Level 4 - trailing banners attach by indentation (one-liner and multi-line
# bodies both adopt a deeper banner; a same-indent banner is a sibling)

class C:
    class CA:
        pass
        # ---- HH ----

    class CB: pass
        # ---- HH ----

    class CC:
        pass
    # ---- HH ----


# Level 5 - a banner inside a class's reported range belongs to the class even
# when it is written at a shallower indent than the class body

class D:
    class DA:
# ---- HH ----
        pass


# Level 6 - multi-line signatures: a deeper trailing banner is inside the
# method, a same-indent banner is a sibling inside the enclosing class

class M:
    def s(
        self,
        p1,
    ):
        return p1
        # ---- HH ----

    def t(
        self,
        p1,
    ): ...
    # ---- HH ----


# Level 7 - inside a class, a subheader groups the sibling methods that follow
# it; a banner deep in a method body stays inside that method

class N:
    def na(self):
        return 1
        # ---- HH ----

    def nb(self):
        return 1
    # ---- HH ----
    def nc(self):
        return 1
# ---- HH ----
    def nd(self):
        return 1


# Level 8 - a class declared inside a method: a same-indent trailing banner is a
# sibling of the inner class, a deeper one lands inside it

class P:
    def pa(self):
        class PP:
            pass
        # ---- HH ----
        return 1

    def pb(self):
        class PQ:
            pass
            # ---- HH ----


# Level 9 - a 3-line header opening a class captures every following method, and
# a trailing subheader lands under that open header

class R:
    # ---------------------------------------------------------------------------- #
    #                             H                             #
    # ---------------------------------------------------------------------------- #
    def ra(self):
        return 1

    def rb(
        self,
        p1,
    ): ...
        # ---- HH ----

    def rc(self):
    # ---- HH ----


# Level 10 - a top-level subheader cascades over the classes that follow it

class E:
    def e(self):
        return 1
    # ---- HH ----
# ---- HH ----


class F:
    def f(self):
        return 1
# ---- HH ----


class G:
    def g(self):
        return 1


# Level 11 - a greedy trailing header adopts an open region, and a malformed
# tail must not crash the parser

# ---------------------------------------------------------------------------- #
#                             H                             #
# ---------------------------------------------------------------------------- #

# region HHH

def unbounded():
    return 1

# ---- HH ----
def broken(
    a,
    b
    return a + b
