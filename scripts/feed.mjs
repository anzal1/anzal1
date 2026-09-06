/**
 * The live feed. Network in, data/feed.json out. Draws nothing.
 *
 * Design rules:
 *   1. Fetching and rendering are separate steps. plates.mjs never touches
 *      the network, so a redraw cannot half-fail, and this script can be run
 *      on its own cadence.
 *   2. Every field is fetched independently and merged over the cached copy.
 *      One dead source degrades one row; it never blanks the plate and never
 *      fails the workflow.
 *   3. Each field records whether THIS run refreshed it. A field that fell
 *      back to cache is marked stale so the plate can dim it rather than
 *      present old data as current. Freshness you can't verify is worse than
 *      an honest "last seen".
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const FEED = new URL('../data/feed.json', import.meta.url);
const P = JSON.parse(readFileSync(new URL('../data/profile.json', import.meta.url), 'utf8'));
const CONTRIB = JSON.parse(readFileSync(new URL('../data/contributions.json', import.meta.url), 'utf8'));
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || '';
const UA = { 'user-agent': `${P.handle}-profile` };

const cached = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : {};
const stale = [];

/** Run one field's fetcher; on any failure keep the cached value and flag it. */
async function field(name, fn) {
  try {
    const v = await fn();
    if (v === null || v === undefined) throw new Error('no value');
    return v;
  } catch (err) {
    console.warn(`  ${name}: ${err.message} — keeping cache`);
    stale.push(name);
    return cached[name] ?? null;
  }
}

/* ---- activity: derived from the calendar, so no extra API call ---------- */

const activity = await field('activity', async () => {
  const days = CONTRIB.weeks.flat().filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new Error('empty calendar');
  const last7 = days.slice(-7);
  return { total: last7.reduce((n, d) => n + d.n, 0), daily: last7.map((d) => d.n) };
});

/* ---- last push: the freshest human-readable signal GitHub exposes ------- */

const lastPush = await field('lastPush', async () => {
  const res = await fetch(`https://api.github.com/users/${P.handle}/events/public?per_page=100`, {
    headers: TOKEN ? { ...UA, authorization: `Bearer ${TOKEN}` } : UA,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`events -> ${res.status}`);
  const events = await res.json();
  // GitHub trims the payload on some pushes, so commits[] can be empty on a
  // perfectly good event. Requiring a message threw those away and reported
  // "no activity" while a push from an hour ago sat right there. Take the
  // event for repo + timestamp; treat the message as a bonus.
  const push = events.find((e) => e.type === 'PushEvent' && e.repo)
    ?? events.find((e) => e.repo);
  if (!push) throw new Error('no repo-bearing event in the recent window');
  const commit = push.payload?.commits?.at(-1);
  return {
    repo: push.repo.name.replace(`${P.handle}/`, ''),
    message: commit ? commit.message.split('\n')[0].slice(0, 66) : null,
    kind: push.type === 'PushEvent' ? 'push' : 'activity',
    at: push.created_at,
  };
});

/* ---- latest post: RSS, no auth ----------------------------------------- */

const latestPost = await field('latestPost', async () => {
  const res = await fetch(P.rss, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`feed -> ${res.status}`);
  const xml = await res.text();
  const item = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!item) throw new Error('no items in feed');
  const pick = (tag) => {
    const m = item[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() : '';
  };
  const title = pick('title')
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  if (!title) throw new Error('item had no title');
  return { title: title.slice(0, 52), at: pick('pubDate') };
});

/* ---- profile stats: followers, repos, stars, languages ------------------ */

const github = await field('github', async () => {
  const h = TOKEN ? { ...UA, authorization: `Bearer ${TOKEN}` } : UA;
  const user = await (await fetch(`https://api.github.com/users/${P.handle}`,
    { headers: h, signal: AbortSignal.timeout(15000) })).json();
  if (!user.login) throw new Error('user lookup failed');

  // Own, non-fork repos only: stars on forks are not this person's work.
  const repos = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/users/${P.handle}/repos?per_page=100&type=owner&page=${page}`,
      { headers: h, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`repos -> ${res.status}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const own = repos.filter((r) => !r.fork);

  // Primary-language share by repo count. The per-repo bytes API would cost
  // one call per repo for a marginally better answer.
  const langCount = {};
  for (const r of own) if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
  const languages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    followers: user.followers,
    repos: own.length,
    stars: own.reduce((n, r) => n + (r.stargazers_count || 0), 0),
    languages,
    topRepos: own
      // the profile repo itself would list here (it has stars) — that's meta
      .filter((r) => r.stargazers_count > 0 && r.name.toLowerCase() !== P.handle)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6)
      .map((r) => ({
        name: r.name,
        stars: r.stargazers_count,
        lang: r.language,
        desc: (r.description || '').slice(0, 72),
      })),
  };
});

/* ---- site health: is the portfolio actually up right now? --------------- */

const site = await field('site', async () => {
  const t0 = Date.now();
  const res = await fetch(P.site, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  return { status: res.status, ms: Date.now() - t0 };
});

const out = {
  refreshedAt: new Date().toISOString(),
  stale,
  activity,
  github,
  lastPush,
  latestPost,
  site,
  streak: CONTRIB.current,
  total: CONTRIB.total,
};
writeFileSync(FEED, JSON.stringify(out, null, 2) + '\n');

console.log(`feed: 7d ${activity?.total ?? '—'} · streak ${out.streak ?? '—'}d · ` +
  `★${github?.stars ?? '—'} · ${github?.repos ?? '—'} repos · ${github?.followers ?? '—'} followers · ` +
  `site ${site ? `${site.status} in ${site.ms}ms` : '—'} · ` +
  `push ${lastPush ? lastPush.repo : '—'}` + (stale.length ? `  [stale: ${stale.join(', ')}]` : ''));
