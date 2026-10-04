import { Array, Data } from "effect"

/** Spec "The deck": four suits of ranks 1–15 and eight face cards, two of each. */
export const SUITS = ["Coins", "Flasks", "Sabers", "Staves"] as const
export type Suit = (typeof SUITS)[number]

export const FACE_CARDS = [
  { name: "The Idiot", value: 0 },
  { name: "Queen of Air and Darkness", value: -2 },
  { name: "Endurance", value: -8 },
  { name: "Balance", value: -11 },
  { name: "Demise", value: -13 },
  { name: "Moderation", value: -14 },
  { name: "The Evil One", value: -15 },
  { name: "The Star", value: -17 },
] as const
export type FaceName = (typeof FACE_CARDS)[number]["name"]

const RANK_NAMES: Readonly<Record<number, string>> = { 12: "Commander", 13: "Mistress", 14: "Master", 15: "Ace" }

/** `id` is unique among every card in play, including cards created by a shift. */
export type Card = Data.TaggedEnum<{
  Suited: { readonly id: number; readonly suit: Suit; readonly value: number }
  Face: { readonly id: number; readonly name: FaceName; readonly value: number }
}>
export const Card = Data.taggedEnum<Card>()

/** A card without identity: what a shift draws from. */
export type Design =
  | { readonly _tag: "Suited"; readonly suit: Suit; readonly value: number }
  | { readonly _tag: "Face"; readonly name: FaceName; readonly value: number }

const suitedDesigns: ReadonlyArray<Design> = SUITS.flatMap((suit) =>
  Array.range(1, 15).map((value) => ({ _tag: "Suited" as const, suit, value })),
)
const faceDesigns: ReadonlyArray<Design> = FACE_CARDS.flatMap(({ name, value }) =>
  [0, 1].map(() => ({ _tag: "Face" as const, name, value })),
)

/** All 76 designs, in a stable order. Shifts draw evenly from this list. */
export const DESIGNS: ReadonlyArray<Design> = [...suitedDesigns, ...faceDesigns]

export const makeCard = (id: number, design: Design): Card =>
  design._tag === "Suited"
    ? Card.Suited({ id, suit: design.suit, value: design.value })
    : Card.Face({ id, name: design.name, value: design.value })

/** The unshuffled 76-card deck with ids 0…75. */
export const fullDeck: ReadonlyArray<Card> = DESIGNS.map((d, id) => makeCard(id, d))

export const isIdiot = (c: Card): boolean => c._tag === "Face" && c.name === "The Idiot"
export const isSuitedValue = (c: Card, value: number): boolean => c._tag === "Suited" && c.value === value

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/** "Master of Coins (+14)", "7 of Sabers (+7)", "Balance (−11)". */
export const describeCard = Card.$match({
  Suited: ({ suit, value }) => `${RANK_NAMES[value] ?? String(value)} of ${suit} (${signed(value)})`,
  Face: ({ name, value }) => `${name} (${signed(value)})`,
})

/** Short face text: "Master", "7", "Idiot". */
export const cardTitle = Card.$match({
  Suited: ({ value }) => RANK_NAMES[value] ?? String(value),
  Face: ({ name }) => name.replace(/^The /, ""),
})
