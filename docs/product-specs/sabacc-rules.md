# Sabacc rules — product spec (Legends)

Status: **authoritative**. `src/domain/` implements exactly this document, and the
player-facing rules in `index.html` must agree with it (`test/unit/rules-copy.test.ts`
checks the numbers). Change this file first, then the code, then the copy.

This is **classic (Legends) Sabacc**. The project owner decided on 2026-10-04 to make
it Legends-accurate, to include the fan-reconstructed West End Games rules, and to use
no-limit betting (see the [exec plan](../exec-plans/completed/2026-10-legends-rules.md)).

Every rule is tagged with its source. Full citations are in
[the lore reference](../references/sabacc-lore.md).

- **[L]** Legends lore (Wookieepedia, Legends articles)
- **[C]** Canon (the Celebration Anaheim abridged rules)
- **[F]** Fan reconstruction of the West End Games rules (*Crisis on Cloud City*):
  the "Cloud City Royal Rules" [HP], or pagat.com [PG]
- **[H]** House choice, where every source is silent or the sources disagree

## Constants

| Name | Value | Constant | Source |
|---|---|---|---|
| Starting credits (you and each opponent) | 10,000 | `STARTING_CREDITS` | [H] |
| Opponents | 4 | `OPPONENT_COUNT` | [H] |
| Ante to the hand pot | 100 | `HAND_ANTE` | [H] amount; equal antes [F HP] |
| Ante to the Sabacc pot | 100 | `SABACC_ANTE` | [L] both pots; [F HP] equal |
| Minimum opening bet and minimum raise | 100 | `MIN_BET` | [H] |
| Cards dealt | 2 | `HAND_SIZE` | [L][F] |
| Shift trigger | doubles on two six-sided dice (1 in 6) | `SHIFT_ODDS` | [F PG] |
| Sabacc target | 23 | `SABACC` | [L] |
| Round cap before the dealer must call | 10 | `MAX_ROUNDS` | [H] safety cap |

## The deck (76 cards) [L]

- Four suits: Coins, Flasks, Sabers, Staves. Each holds ranks 1–11 plus Commander (12),
  Mistress (13), Master (14) and Ace (15). That is 15 cards per suit, 60 in total.
- Sixteen face cards, two of each: The Idiot (0), Queen of Air and Darkness (−2),
  Endurance (−8), Balance (−11), Demise (−13), Moderation (−14), The Evil One (−15)
  and The Star (−17).
- Cards are electronic. A shift changes a card's suit and value, and the deck is not
  involved [L].

## Hand value

1. A hand's **total** is the sum of its card values [L].
2. A hand **bombs out** if its total is above +23, below −23, or exactly 0
   ([L] for ±23; [F HP][F PG] for zero). Bombing out is only checked when the hand
   is revealed [F], so a bad total mid-hand can still be fixed by drawing or by a shift.
3. The **Idiot's Array** is a hand containing The Idiot, a 2 and a 3, in any suits
   [F][L The Idiot]. Extra cards are allowed: Darth Bane won with 2, 3, Idiot, 9, 9 [L].
   It never bombs out.
4. **Pure Sabacc** is a total of exactly +23 or −23 [L].
   Expect it often: the deck makes ±23 in two cards 68 ways out of 2,850, so someone
   at a five-player table is *dealt* a Pure Sabacc in about 12% of hands, and about
   15–17% of hands are won with one (`npm run sim`, 2026-10-04). The lore calls it rare
   but gives no number; this rate follows from the deck, not from the opponents.
5. **Ranking** of hands that didn't bomb out, best first [L]:
   1. Idiot's Array
   2. Pure Sabacc +23, then Pure Sabacc −23
   3. Every other total, by distance from zero. At the same distance positive beats
      negative, so +21 beats −21, and −21 beats +20.

## A hand, step by step

### Setup

1. **Dealer.** The dealer button moves one seat clockwise each hand [C][F HP]. Play
   always starts with the player left of the dealer and goes clockwise.
2. **Antes.** A player needs 200 credits to join a hand. Each player who joins pays
   100 into the hand pot and 100 into the Sabacc pot [L][F HP]. If you can't pay, the
   table is over and you can start a new table. An opponent who can't pay sits out.
3. **Deal.** Each player gets 2 cards, dealt one at a time [L][F].

### Each round

**1. Betting [L][F HP].** Starting left of the dealer, each player still in the hand
acts until every player has matched the highest bet, folded or gone all-in.
- **Check** if there is no bet to match.
- **Bet** at least 100 credits if there is no bet yet.
- **Match** the current bet.
- **Raise**: match, then add at least the size of the previous bet or raise (minimum
  100). There is no maximum besides your credits; this is no-limit [owner].
- **Fold**: you leave the hand, and what you've already put in stays in the pots [F].
- **All-in**: a player with fewer credits than the amount to match may put in
  everything they have. They stay in the hand but can win only the side pots they
  contributed to (see Payouts) [H standard no-limit rule].

**2. Drawing [L][F HP].** In the same order, each player still in the hand takes one
action:
- **Gain**: take one card from the deck.
- **Trade**: discard one card that isn't in the field and take one from the deck.
  Discarded cards leave play and are never shifted [L].
- **Stand**: keep the hand as it is.

A player must keep at least 2 cards [F HP], and there is no maximum [F HP]. If the deck
is empty, only Stand is possible [H].

On the same turn, a player may also move **one** card into the **interference field**
[C]. Field cards are placed face-down [L], so opponents can't see them before the
reveal. They still count toward the hand, are never shifted [L], and can't be traded
or taken back [H].

**3. Sabacc Shift [L][F PG].** Roll two dice. Doubles (1 in 6) trigger a Sabacc Shift
**without warning** [L]: every card outside the interference field, in every hand
still in play, randomly becomes a new card, with a new suit and value drawn evenly
from the 76 card designs [L]. Face cards shift too [L "each card"].

**4. Calling [L][F HP].** From the end of round 1 onward (once every player has had a
turn [F HP]), a call window opens. Starting left of the dealer, each player still in
the hand may **call** the hand or let play continue. A player can't call during their
own turn [L], and the window falls between turns. If nobody calls, the next round
begins. If the round cap is reached, the dealer's seat calls automatically, or the
first player left of the dealer who is still in [H].

### After a call

1. **One last shift check** [L shifts can happen "after a game has been called, but
   before the cards have been shown"; F PG].
2. **Reveal.** All hands, including field cards, are shown [F HP].

## Showdown and payouts

1. **Bombing out [L][F HP].** Every revealed hand that bombs out pays a penalty equal to
   the hand pot at that moment into the Sabacc pot. A player who can't pay it all pays
   everything they have [H].
2. **Failed call [F HP].** If the caller doesn't win (or share) the hand pot, they pay
   the same penalty. A caller who bombed out pays only once.
3. **Winner.** The best-ranked hand that didn't bomb out wins the hand pot [L].
4. **Sudden demise [L].** If the best hands are tied, each tied player is dealt one more
   card and the best new hand wins. If they are still tied, each gets a second card [L].
   If they are still tied after that, they split the pot [F HP]. A tied player whose
   hand bombs out during sudden demise drops out of the tie and pays no penalty. If all
   of them bomb out, the next-best hand that didn't bomb out wins [F HP]. If the deck
   runs out, the tie is split [H].
5. **Sabacc pot [L].** A winner holding an Idiot's Array or a Pure Sabacc also wins the
   Sabacc pot. Shared wins split it. Otherwise it carries over to the next hand.
6. **Side pots [H standard no-limit].** The hand pot is split into layers by how much
   each player put in. Each layer goes to the best hand among the players who paid into
   it and didn't fold. Indivisible credits from a split go to the Sabacc pot [H].
7. **Everyone bombs out [F HP][F PG].** The hand pot moves into the Sabacc pot.
8. **Everyone else folds.** The last player in the hand wins the hand pot without a
   reveal or penalties [F]. The Sabacc pot needs a revealed Pure Sabacc or Idiot's
   Array, so it carries over [H].
9. Credits carry over between hands, and your table (mid-hand too) is saved in this
   browser after every move and restored when you come back. A `?seed=` replay link
   starts an unsaved table. **New table** resets everything [H]. Pure Sabacc
   "typically" ends a game in lore [L]; here play continues [H].

## Opponent behaviour [H]

Opponents use the same rules and see only their own cards. Their policy lives in
`src/domain/ai.ts` and doesn't need to be in the player-facing copy, but it must never
read hidden information (other players' cards, the deck order or future dice rolls).
