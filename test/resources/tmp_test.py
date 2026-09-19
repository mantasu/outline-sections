class Random:
    def a(): pass

class User:
    def __init__(self, name: str):
        self.name = name
    # --------------------------- Should be inside User -------------------------- #
# ----------------------------------- Should be outside user ----------------------------------- #


class User2:
    class Inner1:
        pass
        # --------------------------- Should be inside Inner1 -------------------------- #
# ---------------------------------------------------------------------------- #
#                           Should be inside User2 a                           #
# ---------------------------------------------------------------------------- #
    
    class Inner2:
        pass
# --------------------------- Should be inside User2 b -------------------------- #
        # --------------------------- Should be inside User2 c -------------------------- #
    
    class Inner3: pass
        # --------------------------- Should be inside User2 d -------------------------- #

    class Inner4:
# --------------------------- Should be inside Inner4 -------------------------- #
        pass
# ----------------------------------- Should be outside user2 ----------------------------------- #


class User3:
    # ---------------------------------------------------------------------------- #
    #                    triple-line banner (shoul dbe in User)                    #
    # ---------------------------------------------------------------------------- #
    def __init__(self, name: str):
        self.name = name