// Names for the work an outcome sentence describes. "Add work" asks one sentence ("Make the board
// feel instant when a lot of agents write at once") and needs a group name that is a noun phrase
// ("Board speed"), because the issue titles Codex splits it into are built around that noun. This
// module reads the sentence the way a person would: it drops the opening verb or the subject and
// its modal ("Agents can …", "Teams install …"), cuts the sentence at the first clause, and
// splits what is left into noun chunks at prepositions and verbs. The longest chunk is the topic
// ("Handoff bundle", "Workflow skills"); an adjective that says how the topic should be ("feel
// instant", "smoother") becomes its noun ("Board speed", "Onboarding smoothness"). Pure text, no
// state: the Name step and the mock split read the same function.

/** Verbs an outcome can open with, or follow a subject with ("Teams install …"). */
const VERBS = new Set(
  (
    "add allow archive automate browse build change check choose clean compare configure connect " +
    "convert copy create cut decide define delete deliver design display document download draft " +
    "edit enable evaluate explore export extend find fix get give handle import improve install " +
    "integrate investigate let list load log make merge migrate monitor move open optimize parse " +
    "port print publish push reduce redesign refactor remove rename render replace research resume " +
    "review rewrite run save scan schedule see send set share ship show sign speed split stop " +
    "stream study support sync test track try turn update upgrade upload use validate verify " +
    "write read pick open reach hand keep"
  ).split(" "),
);

const MODALS = new Set("can could should will would must shall".split(" "));
const LINKING = new Set(
  "feel feels be is are become becomes get gets stay stays look looks seem seems remain remains".split(
    " ",
  ),
);
const PARTICLES = new Set(
  "up down out on off in into over to with for from about back away".split(" "),
);
const PREPOSITIONS = new Set(
  "with from over in on for to by via at into across between through under using without of".split(
    " ",
  ),
);
const DETERMINERS = new Set(
  (
    "the a an any every each all some no our your its their this that these those one two three " +
    "many more most other another same whole"
  ).split(" "),
);

/** Words that stand for a noun without naming it. */
const PRONOUNS = new Set("it them they we you us me he she i this that these those".split(" "));

/** What an adjective that ends a phrase asks for, as a noun: "feel instant" → "speed". */
const QUALITY: Record<string, string> = {
  instant: "speed",
  fast: "speed",
  faster: "speed",
  quick: "speed",
  quicker: "speed",
  slow: "speed",
  slower: "speed",
  responsive: "responsiveness",
  simple: "simplicity",
  simpler: "simplicity",
  easy: "ease",
  easier: "ease",
  clear: "clarity",
  clearer: "clarity",
  safe: "safety",
  safer: "safety",
  reliable: "reliability",
  smooth: "smoothness",
  smoother: "smoothness",
  clean: "tidiness",
  cleaner: "tidiness",
  cheap: "cost",
  cheaper: "cost",
};

/** Sentence openers that are not the work itself: "We need to …", "So that …", "Let people …". */
const LEAD_IN =
  /^(?:(?:we|i)\s+(?:want|need|would like)\s+to\s+|so\s+that\s+|(?:let|allow|enable|help)\s+(?:(?:people|users|everyone|anyone|someone|teams?|the team|them|us|you)\s+)?(?:to\s+)?|to\s+)/i;

/** Where the first clause ends: what follows says when or why, not what the work is about. */
const CLAUSE =
  /\s+(?:so that|so|because|when|while|which|that|if|without|instead of|until|since)\s+|[,;:]|\s[—–-]\s/i;

/** The longest name a group gets, in characters. */
export const MAX_NAME = 32;

/** Fillers that make a name of the topic when the sentence has no second noun. */
const FILLERS = ["improvements", "rollout", "basics"];

const lower = (t: string) => t.toLowerCase().replace(/[^a-z-]/g, "");

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Drop the determiners a chunk opens with. */
function bare(tokens: string[]): string[] {
  let out = tokens;
  while (out.length > 1 && DETERMINERS.has(lower(out[0]))) out = out.slice(1);
  const only = out.length === 1 ? lower(out[0]) : "";
  return DETERMINERS.has(only) || PRONOUNS.has(only) ? [] : out;
}

/** The last 3 words of a long chunk: the head noun sits at the end. */
const head = (tokens: string[]) => tokens.slice(-3);

/** Split a run of words into noun chunks at prepositions. */
function chunksOf(tokens: string[]): string[][] {
  const chunks: string[][] = [];
  let run: string[] = [];
  const flush = () => {
    const chunk = bare(run);
    if (chunk.length > 0) chunks.push(head(chunk));
    run = [];
  };
  for (const t of tokens) {
    const w = lower(t);
    if (PREPOSITIONS.has(w) || PARTICLES.has(w)) flush();
    else run.push(t);
  }
  flush();
  return chunks;
}

export interface Topic {
  /** The topic, in the words of the sentence ("handoff bundle"). Empty when the sentence has none. */
  topic: string[];
  /** Other noun chunks of the sentence, best first. */
  others: string[][];
  /** Who or what the sentence is about, when it has a subject ("agents"). */
  subject: string[];
}

/** Read an outcome sentence for its topic. */
export function topicOf(outcome: string): Topic {
  let text = outcome
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  text = text.replace(LEAD_IN, "");
  text = text.split(CLAUSE)[0] ?? text;
  let tokens = text.split(" ").filter(Boolean);
  let subject: string[] = [];

  // "Agents can resume …": the words before a modal are the subject, the verb after it goes.
  const modal = tokens.findIndex((t, i) => i > 0 && MODALS.has(lower(t)));
  if (modal > 0) {
    subject = bare(tokens.slice(0, modal));
    tokens = tokens.slice(modal + 2);
  } else if (tokens.length > 2 && !VERBS.has(lower(tokens[0])) && VERBS.has(lower(tokens[1]))) {
    // "Teams install the workflow skills …": a subject and its verb.
    subject = [tokens[0]];
    tokens = tokens.slice(2);
  } else if (tokens.length > 1 && VERBS.has(lower(tokens[0]))) {
    // "Make the board …", "Push board updates …": the opening verb goes.
    tokens = tokens.slice(1);
    if (tokens.length > 1 && PARTICLES.has(lower(tokens[0]))) tokens = tokens.slice(1);
  }

  // "the board feel instant": a linking verb and an adjective say how the subject should be.
  const link = tokens.findIndex((t, i) => i > 0 && LINKING.has(lower(t)));
  if (link > 0) {
    const owner = bare(tokens.slice(0, link));
    const quality = QUALITY[lower(tokens[link + 1] ?? "")];
    if (owner.length > 0)
      return {
        topic: quality ? [...head(owner), quality] : head(owner),
        others: [],
        subject: owner,
      };
  }
  // "onboarding smoother for a new teammate": the adjective that ends the first phrase becomes its noun.
  const stop = tokens.findIndex((t, i) => i > 0 && PREPOSITIONS.has(lower(t)));
  const first = stop > 0 ? tokens.slice(0, stop) : tokens;
  const last = QUALITY[lower(first.at(-1) ?? "")];
  if (last && first.length > 1) {
    const owner = bare(first.slice(0, -1));
    if (owner.length > 0) return { topic: [...head(owner), last], others: [], subject: owner };
  }

  const chunks = chunksOf(tokens);
  // The longest chunk is the topic; the first one wins a tie.
  const topic = chunks.reduce<string[]>((best, c) => (c.length > best.length ? c : best), []);
  const others = chunks.filter((c) => c !== topic);
  if (topic.length === 0) return { topic: subject, others: [], subject: [] };
  return { topic, others, subject };
}

/**
 * Three group names for an outcome, nouns and not verbs, best first: the topic, other nouns of the
 * sentence and its subject, then the topic with a filler word. `taken` names are skipped (a sibling
 * group). An empty list when the sentence has no noun to name.
 */
export function suggestGroupNames(outcome: string, taken: readonly string[] = []): string[] {
  const { topic, others, subject } = topicOf(outcome);
  if (topic.length === 0) return [];
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  const out: string[] = [];
  const add = (tokens: string[] | string) => {
    const name = upperFirst(
      (Array.isArray(tokens) ? tokens.join(" ") : tokens).replace(/[,;:.]+$/, ""),
    );
    const key = name.toLowerCase();
    if (
      !name ||
      name.length > MAX_NAME ||
      used.has(key) ||
      out.some((o) => o.toLowerCase() === key)
    )
      return;
    out.push(name);
  };
  add(topic);
  for (const o of others) add(o);
  add(subject);
  for (const f of FILLERS) {
    if (out.length >= 3) break;
    add(`${topic.join(" ")} ${f}`);
  }
  return out.slice(0, 3);
}
