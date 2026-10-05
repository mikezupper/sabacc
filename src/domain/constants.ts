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

/** The call window opens from the end of this round onward (spec "Calling"). */
export const CALL_FROM_ROUND = 1

/** House safety cap: after this many rounds the hand is called automatically. */
export const MAX_ROUNDS = 10

/** Sudden demise deals at most this many extra cards before a tie is split. */
export const SUDDEN_DEMISE_CARDS = 2

/** Multiplayer (spec "Multiplayer tables"): seconds per decision before the safe move is played. */
export const TURN_SECONDS = 45
/** Multiplayer: seconds a dropped player's seat waits before the AI plays it. */
export const GRACE_SECONDS = 30
/** Multiplayer: seconds between hands before the next one is dealt. */
export const AUTO_DEAL_SECONDS = 20
