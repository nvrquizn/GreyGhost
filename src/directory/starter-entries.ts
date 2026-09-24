import type { LoreEntry } from "../services/guild-settings.js";

const wiki = (page: string) => `https://awoiaf.westeros.org/index.php/${page}`;

export const starterLoreEntries: LoreEntry[] = [
  {
    id: "house-targaryen", type: "house", name: "House Targaryen", aliases: ["Targaryen", "Targaryens"],
    overview: "A Valyrian dragonlord house that survived the Doom on Dragonstone and later forged the Seven Kingdoms into one realm.",
    facts: [{ label: "Seat", value: "Dragonstone; later King's Landing" }, { label: "Words", value: "Fire and Blood" }, { label: "Sigil", value: "A red three-headed dragon on black" }],
    spoilers: "The dynasty is divided by repeated succession struggles, including the Dance of the Dragons and later Blackfyre rebellions.", spoilerLabel: "General", sourceUrl: wiki("House_Targaryen"),
  },
  {
    id: "house-stark", type: "house", name: "House Stark", aliases: ["Stark", "Starks"],
    overview: "The ancient ruling house of Winterfell, closely tied to the history, customs, and old gods of the North.",
    facts: [{ label: "Seat", value: "Winterfell" }, { label: "Words", value: "Winter Is Coming" }, { label: "Sigil", value: "A grey direwolf on white" }],
    spoilers: "War scatters the Stark family, but its surviving members remain central to the struggle for the North and the threat beyond the Wall.", spoilerLabel: "General", sourceUrl: wiki("House_Stark"),
  },
  {
    id: "house-lannister", type: "house", name: "House Lannister", aliases: ["Lannister", "Lannisters"],
    overview: "The wealthy great house of the westerlands, descended from the rulers of the Rock and famed for its gold and political influence.",
    facts: [{ label: "Seat", value: "Casterly Rock" }, { label: "Words", value: "Hear Me Roar!" }, { label: "Sigil", value: "A golden lion on crimson" }],
    spoilers: "The house becomes one of the chief powers in the War of the Five Kings while tensions within the family steadily reshape its fortunes.", spoilerLabel: "General", sourceUrl: wiki("House_Lannister"),
  },
  {
    id: "house-baratheon", type: "house", name: "House Baratheon", aliases: ["Baratheon", "Baratheons"],
    overview: "A great house founded after Aegon's Conquest, holding Storm's End and carrying the crowned stag of the old storm kings.",
    facts: [{ label: "Seat", value: "Storm's End" }, { label: "Words", value: "Ours Is the Fury" }, { label: "Sigil", value: "A crowned black stag on gold" }],
    spoilers: "Robert's Rebellion places a Baratheon on the Iron Throne; the later succession crisis divides the house into rival royal branches.", spoilerLabel: "General", sourceUrl: wiki("House_Baratheon"),
  },
  {
    id: "house-velaryon", type: "house", name: "House Velaryon", aliases: ["Velaryon", "Velaryons"],
    overview: "An ancient Valyrian house of Driftmark whose fleets, wealth, and close marriage ties made it a powerful Targaryen ally.",
    facts: [{ label: "Seat", value: "High Tide and Castle Driftmark" }, { label: "Words", value: "The Old, the True, the Brave" }, { label: "Sigil", value: "A silver seahorse on sea green" }],
    spoilers: "At the height of Corlys Velaryon's power, the house becomes exceptionally wealthy and plays a leading role in the Dance of the Dragons.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("House_Velaryon"),
  },
  {
    id: "house-blackfyre", type: "house", name: "House Blackfyre", aliases: ["Blackfyre", "Blackfyres"],
    overview: "A cadet branch of House Targaryen founded by Daemon Blackfyre, named for the Valyrian steel sword he carried.",
    facts: [{ label: "Founder", value: "Daemon Blackfyre" }, { label: "Sigil", value: "A black three-headed dragon on red" }, { label: "Conflict", value: "The Blackfyre Rebellions" }],
    spoilers: "Daemon's claim sparks the first Blackfyre Rebellion. His descendants and supporters continue challenging the Targaryen line across several generations.", spoilerLabel: "Books", sourceUrl: wiki("House_Blackfyre"),
  },
  {
    id: "house-martell", type: "house", name: "House Nymeros Martell", aliases: ["House Martell", "Martell", "Martells"],
    overview: "The ruling house of Dorne, shaped by the union of Mors Martell and the Rhoynish warrior-queen Nymeria.",
    facts: [{ label: "Seat", value: "Sunspear" }, { label: "Words", value: "Unbowed, Unbent, Unbroken" }, { label: "Sigil", value: "A red sun pierced by a golden spear" }],
    spoilers: "Dorne enters the Seven Kingdoms through marriage rather than conquest, and later Martells pursue justice for wrongs committed against their family.", spoilerLabel: "General", sourceUrl: wiki("House_Martell"),
  },
  {
    id: "house-tyrell", type: "house", name: "House Tyrell", aliases: ["Tyrell", "Tyrells"],
    overview: "The great house of Highgarden, raised to rule the Reach after Aegon's Conquest and surrounded by powerful bannermen.",
    facts: [{ label: "Seat", value: "Highgarden" }, { label: "Words", value: "Growing Strong" }, { label: "Sigil", value: "A golden rose on green" }],
    spoilers: "During the War of the Five Kings, the Tyrells use alliances and the Reach's resources to become a major force at court.", spoilerLabel: "General", sourceUrl: wiki("House_Tyrell"),
  },
  {
    id: "house-hightower", type: "house", name: "House Hightower", aliases: ["Hightower", "Hightowers"],
    overview: "One of Westeros's oldest and wealthiest houses, ruling Oldtown from the Hightower and maintaining close links to the Faith and Citadel.",
    facts: [{ label: "Seat", value: "The Hightower, Oldtown" }, { label: "Words", value: "We Light the Way" }, { label: "Region", value: "The Reach" }],
    spoilers: "Otto and Alicent Hightower are central to the green faction during the succession crisis that becomes the Dance of the Dragons.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("House_Hightower"),
  },
  {
    id: "rhaenyra-targaryen", type: "character", name: "Rhaenyra Targaryen", aliases: ["Rhaenyra", "The Realm's Delight"],
    overview: "A Targaryen princess named heir by her father, King Viserys I, and the dragonrider bonded to Syrax.",
    facts: [{ label: "House", value: "Targaryen" }, { label: "Dragon", value: "Syrax" }, { label: "Era", value: "The Dance of the Dragons" }],
    spoilers: "After Viserys I's death, Rhaenyra and Aegon II advance rival claims, beginning the Targaryen civil war known as the Dance of the Dragons.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Rhaenyra_Targaryen"),
  },
  {
    id: "daemon-targaryen", type: "character", name: "Daemon Targaryen", aliases: ["Daemon", "The Rogue Prince"],
    overview: "A formidable Targaryen prince, warrior, and dragonrider known for ambition, unpredictability, and his bond with Caraxes.",
    facts: [{ label: "House", value: "Targaryen" }, { label: "Dragon", value: "Caraxes" }, { label: "Title", value: "The Rogue Prince" }],
    spoilers: "Daemon becomes Rhaenyra's consort and one of the black faction's most important commanders during the Dance of the Dragons.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Daemon_Targaryen"),
  },
  {
    id: "daenerys-targaryen", type: "character", name: "Daenerys Targaryen", aliases: ["Daenerys", "Dany", "Mother of Dragons"],
    overview: "An exiled Targaryen princess who grows into a ruler in Essos and becomes the first known dragonrider in generations.",
    facts: [{ label: "House", value: "Targaryen" }, { label: "Dragon", value: "Drogon" }, { label: "Era", value: "War of the Five Kings" }],
    spoilers: "Daenerys hatches three dragons—Drogon, Rhaegal, and Viserion—and builds an army while preparing to pursue her family's claim to Westeros.", spoilerLabel: "General", sourceUrl: wiki("Daenerys_Targaryen"),
  },
  {
    id: "aerion-brightflame", type: "character", name: "Aerion Targaryen", aliases: ["Aerion Brightflame", "Brightflame"],
    overview: "A proud and volatile Targaryen prince, elder brother of the future King Aegon V and son of Prince Maekar.",
    facts: [{ label: "House", value: "Targaryen" }, { label: "Father", value: "Maekar Targaryen" }, { label: "Era", value: "Dunk and Egg" }],
    spoilers: "Aerion's conduct at Ashford brings him into conflict with Dunk. His early death later affects the royal succession.", spoilerLabel: "Books", sourceUrl: wiki("Aerion_Targaryen"),
  },
  {
    id: "jon-snow", type: "character", name: "Jon Snow", aliases: ["Jon", "Lord Snow"],
    overview: "The acknowledged bastard raised at Winterfell alongside Eddard Stark's children, who chooses to join the Night's Watch.",
    facts: [{ label: "Affiliation", value: "Night's Watch" }, { label: "Home", value: "Winterfell" }, { label: "Companion", value: "Ghost" }],
    spoilers: "Jon rises to Lord Commander and faces political division at the Wall while trying to prepare the realm for the threat beyond it.", spoilerLabel: "General", sourceUrl: wiki("Jon_Snow"),
  },
  {
    id: "arya-stark", type: "character", name: "Arya Stark", aliases: ["Arya", "Arya Underfoot"],
    overview: "The fiercely independent younger daughter of Eddard and Catelyn Stark, more drawn to swordplay than courtly convention.",
    facts: [{ label: "House", value: "Stark" }, { label: "Sword", value: "Needle" }, { label: "Direwolf", value: "Nymeria" }],
    spoilers: "Separated from her family by war, Arya survives under assumed identities and eventually travels to Braavos to train with the Faceless Men.", spoilerLabel: "General", sourceUrl: wiki("Arya_Stark"),
  },
  {
    id: "balerion", type: "dragon", name: "Balerion", aliases: ["The Black Dread", "Balerion the Black Dread"],
    overview: "The immense black dragon ridden by Aegon the Conqueror and the last living creature known to have seen Valyria before the Doom.",
    facts: [{ label: "Known Riders", value: "Aegon I, Maegor I, Aerea, Viserys I" }, { label: "Colour", value: "Black" }, { label: "Era", value: "The Conquest and early Targaryen reign" }],
    spoilers: "Balerion helps conquer six kingdoms and later serves several Targaryen riders before dying during the reign of Jaehaerys I.", spoilerLabel: "General", sourceUrl: wiki("Balerion"),
  },
  {
    id: "vhagar", type: "dragon", name: "Vhagar", aliases: [],
    overview: "A bronze dragon first ridden by Visenya Targaryen during the Conquest, eventually becoming the largest living dragon of her age.",
    facts: [{ label: "Known Riders", value: "Visenya, Baelon, Laena, Aemond" }, { label: "Colour", value: "Bronze with green-blue highlights" }, { label: "Era", value: "Conquest through the Dance" }],
    spoilers: "Aemond claims Vhagar after Laena Velaryon's death, making the ancient dragon one of the greens' greatest strengths in the Dance.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Vhagar"),
  },
  {
    id: "dreamfyre", type: "dragon", name: "Dreamfyre", aliases: [],
    overview: "A pale blue she-dragon with silver markings, known for her bonds with Princess Rhaena Targaryen and later Queen Helaena.",
    facts: [{ label: "Known Riders", value: "Rhaena Targaryen, Helaena Targaryen" }, { label: "Colour", value: "Pale blue and silver" }, { label: "Era", value: "Before and during the Dance" }],
    spoilers: "Dreamfyre is kept in the Dragonpit during much of the Dance and is caught in the uprising that reaches the pit.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Dreamfyre"),
  },
  {
    id: "caraxes", type: "dragon", name: "Caraxes", aliases: ["The Blood Wyrm"],
    overview: "A lean, red, battle-tested dragon with an unusually long neck, bonded first to Aemon Targaryen and later to Daemon.",
    facts: [{ label: "Known Riders", value: "Aemon Targaryen, Daemon Targaryen" }, { label: "Colour", value: "Red" }, { label: "Name", value: "The Blood Wyrm" }],
    spoilers: "Caraxes serves the black faction throughout the Dance and confronts Vhagar in the climactic battle above the Gods Eye.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Caraxes"),
  },
  {
    id: "meleys", type: "dragon", name: "Meleys", aliases: ["The Red Queen"],
    overview: "A swift scarlet she-dragon, once ridden by Alyssa Targaryen and later by Princess Rhaenys Targaryen.",
    facts: [{ label: "Known Riders", value: "Alyssa Targaryen, Rhaenys Targaryen" }, { label: "Colour", value: "Scarlet and copper" }, { label: "Name", value: "The Red Queen" }],
    spoilers: "Rhaenys and Meleys fight for the blacks during the Dance and face Sunfyre and Vhagar at Rook's Rest.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Meleys"),
  },
  {
    id: "sunfyre", type: "dragon", name: "Sunfyre", aliases: ["Sunfyre the Golden"],
    overview: "A young golden dragon celebrated for his beauty and bonded to King Aegon II Targaryen.",
    facts: [{ label: "Rider", value: "Aegon II Targaryen" }, { label: "Colour", value: "Gold with pink wing membranes" }, { label: "Era", value: "The Dance of the Dragons" }],
    spoilers: "Sunfyre is severely injured at Rook's Rest yet remains a consequential dragon during the later stages of the Dance.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Sunfyre"),
  },
  {
    id: "seasmoke", type: "dragon", name: "Seasmoke", aliases: [],
    overview: "A pale silver-grey dragon, nimble in the air and first bonded to Laenor Velaryon.",
    facts: [{ label: "Known Riders", value: "Laenor Velaryon, Addam of Hull" }, { label: "Colour", value: "Pale silver-grey" }, { label: "Era", value: "The Dance of the Dragons" }],
    spoilers: "During the Dance, Seasmoke accepts Addam of Hull as a rider and fights for Rhaenyra's cause.", spoilerLabel: "House of the Dragon", sourceUrl: wiki("Seasmoke"),
  },
];
