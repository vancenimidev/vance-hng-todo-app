/**
 * AI Micro-Task Breakdown (simulated).
 *
 * `generateBreakdown(title)` is the single integration point: it is async and
 * returns exactly three actionable step strings. Today it runs a local,
 * intent-aware heuristic; to use a real LLM, replace the body with a call to a
 * serverless endpoint (see agent.md) and keep the same contract.
 */

import { sleep } from '../utils.js';

const STEP_COUNT = 3;

/** Leading verbs stripped to find the task's subject ("Write the report" -> "the report"). */
const LEADING_VERBS = new Set([
  'write', 'draft', 'finish', 'complete', 'do', 'make', 'create', 'build', 'fix', 'debug',
  'implement', 'develop', 'code', 'deploy', 'refactor', 'ship', 'study', 'learn', 'read',
  'review', 'research', 'revise', 'prepare', 'prep', 'plan', 'organize', 'organise', 'clean',
  'tidy', 'buy', 'order', 'get', 'book', 'email', 'call', 'reply', 'send', 'message',
  'contact', 'pay', 'file', 'cook', 'bake', 'design', 'update', 'start', 'schedule', 'set',
  'go', 'submit', 'launch', 'practice', 'practise', 'present', 'host', 'pack', 'renew',
]);

const DETERMINERS = /^(the|a|an|my|our|your|this|that|these|those|some|all)\b/i;

/** Matches a keyword plus common inflections, as a whole word. */
const kw = (...words) => new RegExp(`\\b(?:${words.join('|')})(?:s|es|ed|ing)?\\b`, 'i');

/**
 * Ordered intent rules: the first match wins. `s` is the task subject with a
 * natural determiner ("the landing page"), `raw` is the original title.
 */
const RULES = [
  {
    intent: 'bugfix',
    match: kw('bug', 'fix', 'debug', 'error', 'crash', 'broken', 'hotfix', 'issue'),
    steps: (s) => [
      `Reproduce ${s} reliably and capture the exact error or logs`,
      'Isolate the root cause and implement the smallest safe fix',
      'Add a regression test, verify the fix, and ship it',
    ],
  },
  {
    intent: 'writing',
    match: kw('write', 'draft', 'essay', 'blog', 'article', 'report', 'post', 'proposal', 'document', 'docs', 'newsletter', 'thesis', 'chapter', 'copy'),
    steps: (s) => [
      `Outline the key points and structure for ${s}`,
      'Write a fast, rough first draft without editing',
      'Edit for clarity, proofread, and finalize',
    ],
  },
  {
    intent: 'engineering',
    match: kw('code', 'build', 'develop', 'implement', 'feature', 'app', 'website', 'site', 'api', 'deploy', 'refactor', 'migrate', 'component', 'endpoint', 'database', 'release', 'launch', 'ship'),
    steps: (s) => [
      `Define requirements and acceptance criteria for ${s}`,
      'Implement the core in small, testable increments',
      'Test end-to-end, get a review, and ship',
    ],
  },
  {
    intent: 'meeting',
    match: kw('meeting', 'presentation', 'present', 'pitch', 'slide', 'deck', 'talk', 'demo', 'workshop', 'interview', 'standup', 'webinar'),
    steps: (s) => [
      `Define the goal and 3 key messages for ${s}`,
      'Prepare slides or talking points with one supporting example each',
      'Rehearse once end-to-end and share any pre-reads',
    ],
  },
  {
    intent: 'learning',
    match: kw('study', 'learn', 'exam', 'test', 'quiz', 'revise', 'course', 'lecture', 'read', 'book', 'research', 'homework', 'assignment', 'tutorial'),
    steps: (s) => [
      `Skim ${s} and list the key topics to cover`,
      'Do a focused 25-minute deep-dive on the hardest topic',
      'Test yourself with 5 recall questions and note the gaps',
    ],
  },
  {
    intent: 'communication',
    match: kw('email', 'mail', 'call', 'reply', 'respond', 'message', 'text', 'contact', 'follow', 'ping', 'reach', 'invite'),
    steps: (s) => [
      `Jot down the purpose and the one outcome you need from ${s}`,
      'Draft a short, clear message with a specific ask',
      'Send it and set a follow-up reminder',
    ],
  },
  {
    intent: 'travel',
    match: kw('travel', 'trip', 'vacation', 'holiday', 'flight', 'hotel', 'pack', 'visa', 'passport', 'itinerary'),
    steps: (s) => [
      `Confirm dates, budget, and must-dos for ${s}`,
      'Book transport and accommodation, and save confirmations',
      'Create a packing checklist and prep documents',
    ],
  },
  {
    intent: 'finance',
    match: kw('pay', 'bill', 'budget', 'tax', 'invoice', 'expense', 'finance', 'bank', 'rent', 'subscription', 'insurance', 'renew'),
    steps: (s) => [
      `Gather the statements, amounts, and due dates for ${s}`,
      'Review the figures and flag anything unusual',
      'Complete the payment or submission and save the receipt',
    ],
  },
  {
    intent: 'shopping',
    match: kw('buy', 'shop', 'shopping', 'grocery', 'groceries', 'order', 'purchase', 'gift', 'store'),
    steps: (s) => [
      `List exactly what you need for ${s}`,
      'Compare options and set a budget',
      'Place the order or go shopping, then check off the list',
    ],
  },
  {
    intent: 'fitness',
    match: kw('workout', 'exercise', 'gym', 'run', 'jog', 'yoga', 'train', 'walk', 'swim', 'cycle', 'stretch', 'lift'),
    steps: () => [
      'Pick the session plan and get your gear ready',
      'Warm up for 5–10 minutes',
      'Complete the session, cool down, and log your progress',
    ],
  },
  {
    intent: 'cooking',
    match: kw('cook', 'meal', 'dinner', 'lunch', 'breakfast', 'bake', 'recipe', 'prep'),
    steps: (s) => [
      `Choose the recipe for ${s} and check your ingredients`,
      'Prep everything first: wash, chop, and measure',
      'Cook, plate, and clean up as you go',
    ],
  },
  {
    intent: 'cleaning',
    match: kw('clean', 'tidy', 'organize', 'organise', 'declutter', 'laundry', 'vacuum', 'dishes', 'wash', 'sort'),
    steps: (s) => [
      `Clear the surfaces and gather everything out of place in ${s}`,
      'Sort items into keep, donate, and trash',
      'Wipe down, put everything away, and take out the trash',
    ],
  },
  {
    intent: 'design',
    match: kw('design', 'mockup', 'wireframe', 'logo', 'prototype', 'ui', 'ux', 'figma', 'brand', 'illustration'),
    steps: (s) => [
      `Collect references and define constraints for ${s}`,
      'Sketch 2–3 rough concepts quickly',
      'Refine the strongest concept and get feedback',
    ],
  },
  {
    intent: 'planning',
    match: kw('plan', 'schedule', 'organize', 'goal', 'roadmap', 'strategy', 'event', 'party', 'wedding'),
    steps: (s) => [
      `Define what success looks like for ${s}`,
      'List every task and dependency, then order them by priority',
      'Block time on your calendar for the first three items',
    ],
  },
];

const FALLBACK = (s) => [
  `Define what “done” looks like for ${s}`,
  'Gather everything you need to get started',
  'Work one focused 25-minute session on the first chunk',
];

/** "Write the Q3 report." -> "the Q3 report"; "Groceries" -> "groceries". */
export function extractSubject(title) {
  const clean = title.trim().replace(/[.!?…]+$/, '').replace(/\s+/g, ' ');
  const words = clean.split(' ');
  if (words.length > 1 && LEADING_VERBS.has(words[0].toLowerCase())) words.shift();

  let subject = words.join(' ');
  // Lowercase a sentence-cased first word, but keep acronyms / proper casing like "API" or "iOS".
  const [first] = words;
  if (first && /^[A-Z][a-z]/.test(first)) subject = first.toLowerCase() + subject.slice(first.length);

  if (!subject) return 'this task';
  return DETERMINERS.test(subject) ? subject : `the ${subject}`;
}

/** Pure, synchronous breakdown — handy for tests and seed data. */
export function buildSteps(title) {
  const text = String(title ?? '').trim();
  const subject = extractSubject(text || 'this task');
  const rule = RULES.find((r) => r.match.test(text));
  const steps = (rule ? rule.steps : FALLBACK)(subject, text);
  return steps.slice(0, STEP_COUNT);
}

/** Simulates the latency of a model call so the UI can show its "thinking" state. */
export async function generateBreakdown(title, { latency = 650 } = {}) {
  await sleep(latency);
  return buildSteps(title);
}
