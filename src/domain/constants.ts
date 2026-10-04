// Every number in docs/product-specs/sabacc-rules.md "Constants" lives here.
// test/unit/rules-copy.test.ts checks that index.html agrees with these values.

export const STARTING_CREDITS = 10_000
export const OPPONENT_COUNT = 4

/** Each player antes to both pots, in equal amounts [F HP]. */
export const HAND_ANTE = 100
export const SABACC_ANTE = 100
export const BUY_IN = HAND_ANTE + SABACC_ANTE

/** Minimum opening bet and minimum raise. No maximum: no-limit betting. */
export const MIN_BET = 100

export const HAND_SIZE = 2
export const MIN_HAND = 2

/** A shift happens on doubles with two six-sided dice. */
export const DICE_SIDES = 6

export const SABACC = 23

/** House safety cap: after this many rounds the hand is called automatically. */
export const MAX_ROUNDS = 10

/** Sudden demise deals at most this many extra cards before a tie is split. */
export const SUDDEN_DEMISE_CARDS = 2
