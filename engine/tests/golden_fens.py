"""Shared golden corpus — the single source of expected values (CLAUDE.md §6).

This is data, not logic: the Python golden tests assert against it, and the JS
parity runner (``web/test/parity.mjs``) loads the JSON mirror generated from it so
both languages check the *same* numbers. To add a feature: add its expected value
here first (test-first, CLAUDE.md §13), then implement in Python, then mirror in JS.
"""

# Each entry: fen -> {"w": {...}, "b": {...}, "tension": int}
# Only the fields named are asserted, so partial expectations (e.g. the start
# position without kp) are allowed.
GOLDEN = {
    # Start position (CLAUDE.md §6).
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1": {
        "w": {
            "control": 22, "space": 0, "center": 0,
            "hang_ct": 0, "hang_val": 0, "shield": 3, "mat": 39,
            "dev": 0, "castled": 0,
            "center_occ": 0, "islands": 1, "isolated": 0, "doubled": 0,
            "passed": 0, "rook_open": 0, "mobility": 18,
            "outpost": 0, "bishop_quality": 0.0, "coordination": 13, "colour_complex": 0,
            "in_check": 0,
        },
        "b": {
            "control": 22, "space": 0, "center": 0,
            "hang_ct": 0, "hang_val": 0, "shield": 3, "mat": 39,
            "dev": 0, "castled": 0,
            "center_occ": 0, "islands": 1, "isolated": 0, "doubled": 0,
            "passed": 0, "rook_open": 0, "mobility": 18,
            "outpost": 0, "bishop_quality": 0.0, "coordination": 13, "colour_complex": 0,
            "in_check": 0,
        },
        "tension": 0,
    },
    # Club game after 8...Nh5 (CLAUDE.md §6). Black's queen is the hanging value-9 piece.
    "r2qk2r/ppp2pp1/2np3p/2b1p2n/2B1P1bB/3P1N2/PPPN1PPP/R2Q1RK1 w kq - 4 9": {
        "w": {
            "control": 38, "space": 11, "center": 6,
            "hang_ct": 0, "hang_val": 0, "kp": 1, "shield": 3, "mat": 39,
            "center_occ": 1, "islands": 1, "isolated": 0, "doubled": 0,
            "passed": 0, "rook_open": 0, "mobility": 35,
            "outpost": 0, "bishop_quality": 2.25, "coordination": 14, "colour_complex": 2,
            "in_check": 0,
        },
        "b": {
            "control": 38, "space": 10, "center": 5,
            "hang_ct": 1, "hang_val": 9, "kp": 3, "shield": 2, "mat": 39,
            "center_occ": 1, "islands": 1, "isolated": 0, "doubled": 0,
            "passed": 0, "rook_open": 0, "mobility": 44,
            "outpost": 0, "bishop_quality": 2.857142857142857, "coordination": 12, "colour_complex": -8,
            "in_check": 0,
        },
        "tension": 6,
    },
}
