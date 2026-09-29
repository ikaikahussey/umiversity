export type SeedLesson = { title: string; slug: string; minutes: number; body: string };
export type SeedUnit = { title: string; slug: string; summary: string; lessons: SeedLesson[] };
export type SeedCourse = {
  title: string;
  slug: string;
  fieldSlug: string;
  summary: string;
  keywords: string;
  overview: string;
  units: SeedUnit[];
  cards: { kind: "word" | "fact" | "question"; body: string; answer?: string }[];
};

/**
 * Launch content for the two seeded courses. It is a starting outline for
 * Stewards and Editors to revise through the normal revision workflow.
 */
export const LAUNCH_COURSES: SeedCourse[] = [
  {
    title: "ʻŌlelo Hawaiʻi",
    slug: "olelo-hawaii",
    fieldSlug: "hawaiian-language",
    summary: "The Hawaiian language: sounds, greetings, numbers and sentence patterns.",
    keywords: "Hawaiian language olelo hawaii pronunciation grammar",
    overview:
      "ʻŌlelo Hawaiʻi is the Hawaiian language, an official language of the State of Hawaiʻi. " +
      "This course starts with the sound system and builds toward everyday conversation and the basic sentence patterns (pepeke).\n\n" +
      "Work through the units in order. Each lesson is short; ask questions in the lesson discussion.",
    units: [
      {
        title: "Ka Pīʻāpā — Sounds and Letters",
        slug: "ka-piapa",
        summary: "The Hawaiian alphabet, the ʻokina and the kahakō.",
        lessons: [
          {
            title: "Nā Woela — Vowels",
            slug: "na-woela",
            minutes: 10,
            body:
              "Hawaiian has five vowels: **a, e, i, o, u**.\n\n" +
              "- **a** as in *father*\n- **e** as in *bet*\n- **i** as in *machine*\n- **o** as in *sole*\n- **u** as in *rule*\n\n" +
              "Every vowel is pronounced. In *aloha* you say each vowel: a-lo-ha.\n\n" +
              "Practice: **aloha**, **mahalo**, **keiki** (child), **kumu** (teacher).",
          },
          {
            title: "Nā Koneka — Consonants and the ʻOkina",
            slug: "na-koneka",
            minutes: 10,
            body:
              "The consonants are **h, k, l, m, n, p, w** and the **ʻokina** (ʻ).\n\n" +
              "The ʻokina is a glottal stop, like the break in English *uh-oh*. It is a full consonant: " +
              "writing or omitting it changes the word.\n\n" +
              "The letter **w** is often pronounced like *v* after **i** and **e**, like *w* after **o** and **u**, " +
              "and either way at the start of a word or after **a**.\n\n" +
              "Every syllable ends in a vowel, and consonants never cluster.",
          },
          {
            title: "Ke Kahakō — Long Vowels",
            slug: "ke-kahako",
            minutes: 8,
            body:
              "The **kahakō** is the line over a vowel: **ā ē ī ō ū**. It marks a longer vowel and often carries stress.\n\n" +
              "Like the ʻokina, the kahakō changes meaning. Compare **mana** (spiritual power) and **māna** (a mouthful of chewed food).\n\n" +
              "Search on this site matches words with or without ʻokina and kahakō, but in your own writing, include them.",
          },
        ],
      },
      {
        title: "Nā Aloha — Greetings",
        slug: "na-aloha",
        summary: "Greetings, introductions and courtesy.",
        lessons: [
          {
            title: "Aloha kakahiaka — Greetings by Time of Day",
            slug: "aloha-kakahiaka",
            minutes: 10,
            body:
              "- **Aloha kakahiaka** — good morning\n- **Aloha ʻauinalā** — good afternoon\n- **Aloha ahiahi** — good evening\n\n" +
              "**Aloha** alone works at any time. To part, say **A hui hou** — until we meet again.",
          },
          {
            title: "Pehea ʻoe? — How Are You?",
            slug: "pehea-oe",
            minutes: 10,
            body:
              "- **Pehea ʻoe?** — How are you?\n- **Maikaʻi au.** — I am fine.\n- **Maikaʻi nō.** — Very well.\n- **Mahalo.** — Thank you.\n\n" +
              "Notice that the describing word (*maikaʻi*) comes before the subject (*au*).",
          },
          {
            title: "ʻO wai kou inoa? — Names",
            slug: "o-wai-kou-inoa",
            minutes: 10,
            body:
              "- **ʻO wai kou inoa?** — What is your name?\n- **ʻO Leilani koʻu inoa.** — My name is Leilani.\n\n" +
              "The marker **ʻo** introduces a name or proper noun in this sentence pattern.",
          },
        ],
      },
      {
        title: "Nā Helu — Numbers",
        slug: "na-helu",
        summary: "Counting from one to ten.",
        lessons: [
          {
            title: "ʻEkahi a ʻUmi — One to Ten",
            slug: "ekahi-a-umi",
            minutes: 10,
            body:
              "1. ʻekahi\n2. ʻelua\n3. ʻekolu\n4. ʻehā\n5. ʻelima\n6. ʻeono\n7. ʻehiku\n8. ʻewalu\n9. ʻeiwa\n10. ʻumi\n\n" +
              "The prefix **ʻe-** is used when counting. Say the numbers aloud and keep the ʻokina at the start of each.",
          },
        ],
      },
      {
        title: "Ka Pepeke — Sentence Patterns",
        slug: "ka-pepeke",
        summary: "Articles, plurals and verb-first sentences.",
        lessons: [
          {
            title: "Ka a me Ke — The Articles",
            slug: "ka-a-me-ke",
            minutes: 10,
            body:
              "Hawaiian has two forms of *the*: **ka** and **ke**.\n\n" +
              "Use **ke** before words that start with **k, e, a, o** (the *KEAO* rule), and before some words starting with ʻokina. " +
              "Use **ka** everywhere else.\n\n" +
              "- **ke kumu** — the teacher\n- **ka wahine** — the woman\n\n" +
              "The plural marker **nā** replaces the article: **nā kumu** — the teachers.",
          },
          {
            title: "Hele au — Verb-First Sentences",
            slug: "hele-au",
            minutes: 12,
            body:
              "Hawaiian sentences usually begin with the verb or description, then the subject.\n\n" +
              "- **Hele au i ke kula.** — I go to school.\n- **Heluhelu ʻo Kaleo.** — Kaleo reads.\n\n" +
              "Sentence patterns are called **pepeke**. Later units cover each type in detail.",
          },
        ],
      },
    ],
    cards: [
      { kind: "word", body: "ʻāina", answer: "land; that which feeds" },
      { kind: "word", body: "kumu", answer: "teacher; source; foundation" },
      { kind: "question", body: "What does the ʻokina represent?", answer: "A glottal stop, a full consonant." },
      { kind: "word", body: "haumāna", answer: "student" },
      { kind: "fact", body: "Use ke before words starting with k, e, a or o; use ka elsewhere." },
      { kind: "question", body: "How do you say “good evening”?", answer: "Aloha ahiahi" },
      { kind: "word", body: "ʻohana", answer: "family" },
    ],
  },
  {
    title: "Moʻolelo Hawaiʻi",
    slug: "moolelo-hawaii",
    fieldSlug: "history",
    summary: "Hawaiian history from voyaging and settlement through the kingdom, overthrow and renaissance.",
    keywords: "Hawaiian history moolelo hawaii kingdom overthrow voyaging",
    overview:
      "Moʻolelo Hawaiʻi surveys Hawaiian history. Units run roughly in time order, " +
      "from Polynesian voyaging to the Hawaiian Renaissance. Add sources as resources on each lesson.",
    units: [
      {
        title: "Ka Hōʻea ʻAna — Voyaging and Settlement",
        slug: "voyaging-and-settlement",
        summary: "How Polynesian navigators found and settled the islands.",
        lessons: [
          {
            title: "Wayfinding",
            slug: "wayfinding",
            minutes: 12,
            body:
              "Polynesian navigators crossed thousands of miles of open ocean without instruments, " +
              "reading stars, swells, winds, clouds and birds.\n\n" +
              "In 1976 the voyaging canoe **Hōkūleʻa** sailed from Hawaiʻi to Tahiti using traditional navigation, " +
              "guided by Mau Piailug of Satawal. The voyage helped spark a revival of wayfinding.",
          },
          {
            title: "Settlement of the Islands",
            slug: "settlement",
            minutes: 10,
            body:
              "Voyagers from central and eastern Polynesia settled Hawaiʻi. Estimates of first settlement vary; " +
              "recent radiocarbon studies point to roughly 1000–1200 CE, while older estimates were earlier.\n\n" +
              "Settlers brought canoe plants such as kalo (taro), ʻulu (breadfruit) and niu (coconut).",
          },
        ],
      },
      {
        title: "Ke Kumulipo — Genealogy and Moʻolelo",
        slug: "ke-kumulipo",
        summary: "Creation chant and oral tradition.",
        lessons: [
          {
            title: "The Kumulipo",
            slug: "the-kumulipo",
            minutes: 12,
            body:
              "The **Kumulipo** is a genealogical chant of more than two thousand lines that traces the origin of the world " +
              "from darkness through the birth of plants, animals and people, linking a chiefly line to that creation.\n\n" +
              "King Kalākaua had the chant printed in 1889, and Queen Liliʻuokalani published an English translation in 1897.",
          },
        ],
      },
      {
        title: "Ke Aupuni — The Hawaiian Kingdom",
        slug: "ke-aupuni",
        summary: "Unification, the end of the kapu system and constitutional government.",
        lessons: [
          {
            title: "Kamehameha and Unification",
            slug: "kamehameha-unification",
            minutes: 12,
            body:
              "Kamehameha I brought the islands under one rule. By 1810 Kaumualiʻi of Kauaʻi agreed to accept his rule, " +
              "completing unification of the Hawaiian Kingdom.",
          },
          {
            title: "ʻAi Noa and Constitutional Change",
            slug: "ai-noa",
            minutes: 12,
            body:
              "In 1819, after Kamehameha I died, Liholiho (Kamehameha II) and Kaʻahumanu ended the kapu system by eating together, " +
              "an act called **ʻai noa**.\n\n" +
              "The kingdom adopted its first constitution in 1840. The **Māhele** of 1848 divided land among the crown, " +
              "the government and the chiefs, opening the way to private land ownership.",
          },
        ],
      },
      {
        title: "Ka Hoʻokahuli — Overthrow and After",
        slug: "ka-hookahuli",
        summary: "The overthrow, annexation and the Hawaiian Renaissance.",
        lessons: [
          {
            title: "The Overthrow of 1893",
            slug: "overthrow-1893",
            minutes: 12,
            body:
              "On January 17, 1893, Queen Liliʻuokalani was overthrown by a group of businessmen backed by U.S. Marines " +
              "landed from the USS Boston.\n\n" +
              "In 1897 Hawaiians signed the **Kūʻē Petitions** opposing annexation. The United States annexed Hawaiʻi in 1898 " +
              "by joint resolution. In 1993 Congress passed the Apology Resolution acknowledging the U.S. role in the overthrow.",
          },
          {
            title: "Language and the Hawaiian Renaissance",
            slug: "hawaiian-renaissance",
            minutes: 12,
            body:
              "An 1896 law made English the medium of instruction in schools, and the number of native speakers declined sharply over the next century.\n\n" +
              "The Hawaiian Renaissance of the 1970s revived language, hula, voyaging and land rights activism. " +
              "The 1978 state constitutional convention made Hawaiian an official language of the state, " +
              "and Pūnana Leo language nests opened in the 1980s.",
          },
        ],
      },
    ],
    cards: [
      { kind: "fact", body: "Hōkūleʻa sailed to Tahiti in 1976 using traditional wayfinding." },
      { kind: "question", body: "In what year was Queen Liliʻuokalani overthrown?", answer: "1893" },
      { kind: "fact", body: "The Kumulipo is a creation chant of more than two thousand lines." },
      { kind: "question", body: "What was ʻai noa?", answer: "The 1819 act of eating together that ended the kapu system." },
      { kind: "fact", body: "Hawaiian became an official language of the State of Hawaiʻi in 1978." },
      { kind: "question", body: "What did the Māhele of 1848 do?", answer: "Divided land among the crown, government and chiefs." },
      { kind: "fact", body: "The Kūʻē Petitions of 1897 opposed annexation." },
    ],
  },
];
