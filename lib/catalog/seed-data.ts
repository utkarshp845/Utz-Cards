import type { NewCard } from "@/db/schema";

/**
 * Bootstrap catalog for exercising the ingestion → embedding → search
 * pipeline while we don't yet have a real checklist source.
 *
 * What's REAL here: sport, product/brand names (Panini Prizm, Panini
 * Donruss, Topps Chrome UEFA Club Competitions — actual products), and
 * player names (real, public professional athletes).
 *
 * What's SYNTHETIC: which player got which card number, which parallels
 * exist, and which specific cards are flagged rookie/auto/relic. I do not
 * have reliable memory of real per-set checklists, and the one source that
 * has them — SportsCardsPro — requires a paid "Legendary" subscription we
 * haven't set up (confirmed by reading their docs directly). Rather than
 * assert invented facts as if they were a real checklist, every row here is
 * generated deterministically and tagged `source: "seed-synthetic"` so it's
 * unambiguous and easy to find/delete later.
 *
 * Replace this with real data before this app is used to identify or price
 * anything for real: either a SportsCardsPro subscription (see README) or
 * an export of your friend's actual inventory.
 */

type SportKey = "football" | "basketball" | "soccer";

const ROSTERS: Record<SportKey, string[]> = {
  football: [
    "Patrick Mahomes",
    "Justin Jefferson",
    "Ja'Marr Chase",
    "Josh Allen",
    "Joe Burrow",
    "CeeDee Lamb",
    "Micah Parsons",
    "Trevor Lawrence",
    "Justin Herbert",
    "Jalen Hurts",
  ],
  basketball: [
    "Ja Morant",
    "LaMelo Ball",
    "Luka Doncic",
    "Zion Williamson",
    "Anthony Edwards",
    "Victor Wembanyama",
    "Paolo Banchero",
    "Scottie Barnes",
    "Chet Holmgren",
    "Tyrese Haliburton",
  ],
  soccer: [
    "Erling Haaland",
    "Kylian Mbappe",
    "Jude Bellingham",
    "Vinicius Junior",
    "Bukayo Saka",
    "Pedri",
    "Jamal Musiala",
    "Lamine Yamal",
    "Christian Pulisic",
    "Gio Reyna",
  ],
};

const PRODUCTS: Record<SportKey, { brand: string; setName: string }[]> = {
  football: [
    { brand: "Panini", setName: "Prizm" },
    { brand: "Panini", setName: "Donruss" },
  ],
  basketball: [
    { brand: "Panini", setName: "Prizm" },
    { brand: "Panini", setName: "Donruss" },
  ],
  soccer: [
    { brand: "Panini", setName: "Prizm" },
    { brand: "Topps", setName: "Chrome UEFA Club Competitions" },
  ],
};

const YEARS = [2022, 2023];

const VARIATIONS: { label: string | null; serialTo?: number }[] = [
  { label: null }, // base
  { label: "Silver" },
  { label: "Gold", serialTo: 10 },
];

/** Small deterministic hash — reproducible across runs, no crypto needed here. */
function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function generateSeedCatalog(): NewCard[] {
  const cards: NewCard[] = [];

  for (const sport of Object.keys(ROSTERS) as SportKey[]) {
    for (const player of ROSTERS[sport]) {
      for (const { brand, setName } of PRODUCTS[sport]) {
        for (const year of YEARS) {
          for (const variation of VARIATIONS) {
            const key = `${sport}|${year}|${setName}|${player}|${variation.label ?? ""}`;
            const h = seedHash(key);

            cards.push({
              sport,
              year,
              brand,
              setName,
              cardNumber: String((h % 299) + 1),
              playerName: player,
              variation: variation.label,
              attributes: {
                rookie: h % 7 === 0,
                autograph: h % 11 === 0,
                relic: h % 13 === 0,
                ...(variation.serialTo
                  ? { serialNumberedTo: variation.serialTo }
                  : {}),
              },
              imageUrl: null,
              source: "seed-synthetic",
              sourceId: key,
            });
          }
        }
      }
    }
  }

  return cards;
}
