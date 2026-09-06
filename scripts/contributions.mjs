/**
 * Writes data/contributions.json — the last 12 months of contribution days
 * plus derived streaks, for the animated heatmap.
 *
 * Needs a token because the calendar is GraphQL-only. Fails soft: if the API
 * is unreachable the previous file is kept, because a stale heatmap beats a
 * broken one and beats failing the scheduled workflow.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const CACHE = new URL('../data/contributions.json', import.meta.url);
const LOGIN = JSON.parse(readFileSync(new URL('../data/profile.json', import.meta.url), 'utf8')).handle;
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || '';

const QUERY = `query($login:String!){
  user(login:$login){
    createdAt
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount weekday } }
      }
    }
  }
}`;

// contributionsCollection is capped at a one-year span, so the all-time
// journey is one query per calendar year since the account was created.
const YEAR_QUERY = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    contributionsCollection(from:$from,to:$to){
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount } }
      }
    }
  }
}`;

function bail(why) {
  console.warn(`contributions: ${why}`);
  if (existsSync(CACHE)) { console.warn('  keeping the existing data/contributions.json'); process.exit(0); }
  console.warn('  no cache — writing an empty calendar so the build can continue');
  writeFileSync(CACHE, JSON.stringify({ total: null, longest: null, current: null, weeks: [], generated: null }, null, 2) + '\n');
  process.exit(0);
}

if (!TOKEN) bail('no PROFILE_TOKEN/GITHUB_TOKEN in the environment');

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', 'user-agent': `${LOGIN}-profile` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

let cal, createdAt;
try {
  const data = await gql(QUERY, { login: LOGIN });
  cal = data.user.contributionsCollection.contributionCalendar;
  createdAt = data.user.createdAt;
} catch (err) { bail(err.message); }

// The journey: monthly totals from the account's first year to now. Failure
// here degrades to whatever the cache holds — the 12-month data above is the
// primary payload and has already succeeded.
let journey = null;
try {
  const firstYear = new Date(createdAt).getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  const monthly = {};
  let allTime = 0;
  for (let y = firstYear; y <= thisYear; y++) {
    const data = await gql(YEAR_QUERY, {
      login: LOGIN, from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z`,
    });
    const yc = data.user.contributionsCollection.contributionCalendar;
    allTime += yc.totalContributions;
    for (const w of yc.weeks) for (const d of w.contributionDays) {
      if (d.contributionCount > 0) {
        const key = d.date.slice(0, 7);
        monthly[key] = (monthly[key] || 0) + d.contributionCount;
      }
    }
  }
  journey = { since: `${firstYear}`, allTime, monthly };
} catch (err) {
  console.warn(`journey unavailable (${err.message}) — keeping cached months`);
  if (existsSync(CACHE)) journey = JSON.parse(readFileSync(CACHE, 'utf8')).journey ?? null;
}

const days = cal.weeks.flatMap((w) => w.contributionDays);

// Streaks walk the flat day list; `current` only counts if the run reaches the
// final day of the window, otherwise a past streak would masquerade as live.
let run = 0, longest = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; if (run > longest) longest = run; }
let current = 0;
for (let i = days.length - 1; i >= 0 && days[i].contributionCount > 0; i--) current++;

const out = {
  journey,
  total: cal.totalContributions,
  longest,
  current,
  generated: new Date().toISOString().slice(0, 10),
  weeks: cal.weeks.map((w) => w.contributionDays.map((d) => ({ n: d.contributionCount, w: d.weekday, date: d.date }))),
};
writeFileSync(CACHE, JSON.stringify(out) + '\n');
console.log(`contributions: ${out.total} in 12mo · all-time ${journey?.allTime ?? '—'} since ${journey?.since ?? '—'}` +
  ` · ${Object.keys(journey?.monthly ?? {}).length} months`);
console.log(`  window: ${out.total} total · longest ${longest}d · current ${current}d · ${out.weeks.length} weeks`);
