# Sabacc in Star Wars lore vs this game

Researched 2026-10-04 for bead `sabacc-692`. Sources are Wookieepedia (read via its
MediaWiki API), StarWars.com and fan transcriptions of West End Games' *Crisis on
Cloud City* (1989), marked [fan]. The table below describes the **house variant this
game used until 2026-10-04**. The game is now being moved to Legends rules (epic
`sabacc-ecb`, [spec](../product-specs/sabacc-rules.md)).

## Status

As of 2026-10-04 the game implements Legends Sabacc per the
[spec](../product-specs/sabacc-rules.md), where every rule carries a source tag. The
table below is the historical audit of the **old house variant** that prompted the
change.

## The old house variant vs Legends (classic) Sabacc

| Topic | Legends Sabacc | This game | Accurate? |
|---|---|---|---|
| Deck | 76 cards: 4 suits (Coins, Flasks, Sabers, Staves) × 1–11 plus Commander 12, Mistress 13, Master 14, Ace 15; 8 face cards × 2 [1] | 100 cards: 4 suits × ±1…±10 plus four 0s; 4 special cards | No |
| Queen of Air and Darkness | −2 [2] | −2 | Yes |
| The Idiot | 0 [3] | 0 | Yes |
| Balance | −11 [4] | ±10 (auto best) | No: no source for ±10 |
| "Master of Coins" | Not a special card: the Master (14) of the Coins suit, in Han's winning hand [5] | Special card worth −3 | No |
| Other face cards | Endurance −8, Demise −13, Moderation −14, The Evil One −15, The Star −17 [1] | Absent | No |
| Target | Absolute value closest to 23; ±23 is Pure Sabacc [1][6] | Same | Yes |
| Tie at the same magnitude | Positive beats negative (+21 beats −21; +23 beats −23) [1][6] | Split the pot | No |
| Other ties | "Sudden demise": tied players draw a card [7]; canon Anaheim rules use a random roll [8] | Split the pot | No |
| Idiot's Array (Idiot + 2 + 3) | Beats Pure Sabacc and wins the Sabacc pot [9] | Absent | No |
| Bombing out | Above +23 or below −23; zero too [fan]; pay the hand pot's value into the Sabacc pot [10] | Bust above ±23; no penalty beyond the ante | Partly |
| Pots | Everyone antes to the hand pot and the Sabacc pot [1][11] | One ante; the Sabacc pot is funded by protection and split remainders | No |
| Sabacc pot winner | Pure Sabacc or Idiot's Array [11] | Pure Sabacc | Partly |
| Ending a hand | Betting rounds; a player calls (from the 4th round [fan]) [1][10] | Fixed 1–5 rounds, no betting beyond the ante | No |
| Sabacc Shift | Randomizer pulses change the suit/value of every card not in the field [1] | Random chance per round; each card replaced with 50% | Close in spirit |
| Interference field | Cards placed in it are frozen against shifts (1 per turn in canon rules [8]) | A paid "protection" for the whole hand; the name labels an odds meter | No |

## How often Pure Sabacc happens

Lore treats Pure Sabacc as rare but gives no rate. Measured with `npm run sim`
(2,000 hands, 2026-10-04): someone is dealt ±23 in 11.9% of hands, and Pure Sabacc
wins 17.3% of hands, or 13.3% when you fold every hand. Moving the earliest call from
round 1 (Cloud City rules) to round 4 (pagat.com) only lowers that to 14.8%. The rate
comes from the Legends deck at a five-player table, so the opponent policy wasn't
weakened to suppress it (bead `sabacc-byq`).

## Other canon variants (for reference)

- **Corellian Spike** (*Solo*, Galaxy's Edge): 62 cards, three suits ±1…±10 plus two
  sylops (0). The target is **0**. Spike dice trigger shifts. 3 rounds. [12]
- **Kessel Sabacc** (*Star Wars Outlaws*): Sand and Blood decks of 22 cards. Your
  hand's value is the difference between your two cards, and 0 is a sabacc.
  Impostor cards take a dice-rolled value; sylops copy the other card. [13][14]

Our ±1…±10 suits with zeros look like Corellian Spike's deck, used with the Legends
±23 target.

## Unconfirmed or conflicting sources

- The Star: −17 (Legends, Anaheim deck) vs −10 (*Bloodline*).
- Idiot's Array: some sources require the 2 and 3 to share a suit; others don't.
- Zero bombing out and "call from the 4th round" appear only in fan transcriptions.
- Ties: sudden demise (Legends) vs a random roll (canon Anaheim rules).

## Sources

1. https://starwars.fandom.com/wiki/Sabacc/Legends
2. https://starwars.fandom.com/wiki/Queen_of_Air_and_Darkness/Legends
3. https://starwars.fandom.com/wiki/The_Idiot/Legends
4. https://starwars.fandom.com/wiki/Balance/Legends and https://starwars.fandom.com/wiki/Balance
5. https://starwars.fandom.com/wiki/Cloud_City_Sabacc_Tournament
6. https://starwars.fandom.com/wiki/Pure_Sabacc/Legends
7. https://starwars.fandom.com/wiki/Sudden_demise
8. https://starwars.fandom.com/wiki/Sabacc
9. https://starwars.fandom.com/wiki/Idiot%27s_Array/Legends
10. [fan] https://hyperspaceprops.com/wp-content/uploads/2021/11/Sabacc-Rules-1.1.pdf and https://www.pagat.com/invented/sabacc.html
11. https://starwars.fandom.com/wiki/Sabacc_pot/Legends
12. https://starwars.fandom.com/wiki/Corellian_Spike
13. https://starwars.fandom.com/wiki/Kessel_Sabacc
14. https://www.starwars.com/news/star-wars-outlaws-sabacc-and-dejarik
