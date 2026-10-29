import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build, checkUrl, isPlaceholder, ROOT } from '../scripts/bygg.mjs';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'";
const SYNT = { newsletter: { url: 'https://kundklubb.example/anmalan' }, loyalty: { url: 'https://stampel.example/kort' } };
const MAIN = 'https://www.sandaredskvarterskrog.com/';

let tmp;
before(async () => { tmp = await mkdtemp(path.join(os.tmpdir(), 'kundklubb-')); });
after(async () => { await rm(tmp, { recursive: true, force: true }); });

const buildWith = async (config, name) => {
  const out = path.join(tmp, name);
  const res = await build({ out, config });
  return { ...res, html: await readFile(path.join(out, 'index.html'), 'utf8'), robots: await readFile(path.join(out, 'robots.txt'), 'utf8') };
};

async function files(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...(await files(p))); else list.push(p);
  }
  return list;
}

test('vercel.json: strikt CSP oförändrad, dist, bygg och ignoreCommand', async () => {
  const v = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(v.outputDirectory, 'dist');
  assert.equal(v.buildCommand, 'node scripts/bygg.mjs');
  assert.match(v.ignoreCommand, /git diff --quiet "\$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \.\//);
  const all = v.headers.flatMap(h => h.headers);
  const csp = all.filter(h => h.key === 'Content-Security-Policy');
  assert.equal(csp.length, 1);
  assert.equal(csp[0].value, CSP);
  for (const d of ["form-action 'none'", "connect-src 'none'", "frame-ancestors 'none'", "default-src 'self'", "script-src 'self'"]) assert.ok(csp[0].value.includes(d), d);
  assert.doesNotMatch(csp[0].value, /unsafe-|https?:|\*|data:/);
  assert.ok(all.some(h => h.key === 'X-Content-Type-Options' && h.value === 'nosniff'));
});

test('platshållare: ingen länk, inaktiv knapp "Kommer snart", noindex', async () => {
  const conf = JSON.parse(await readFile(path.join(ROOT, 'kundklubb.config.json'), 'utf8'));
  assert.ok(isPlaceholder(conf.newsletter.url) && isPlaceholder(conf.loyalty.url), 'repots konfiguration ska bara ha platshållare');
  for (const [name, config] of [['repo', conf], ['tom', {}], ['en-saknas', { newsletter: SYNT.newsletter, loyalty: { url: '' } }]]) {
    const { html, robots, noindex } = await buildWith(config, name);
    assert.equal(noindex, true);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(robots, /Disallow: \//);
    assert.match(html, /Kommer snart/);
    assert.match(html, /aria-disabled="true"/);
    assert.doesNotMatch(html, /\[BREVO|\[STAMPIOO|\{\{/);
    const hrefs = [...html.matchAll(/href="(https:[^"]+)"/g)].map(m => m[1]).filter(h => h !== MAIN);
    if (name === 'en-saknas') assert.deepEqual(hrefs, [SYNT.newsletter.url]);
    else assert.deepEqual(hrefs, []);
  }
});

test('riktiga https-länkar: knappar med rel="noopener noreferrer" och ingen noindex', async () => {
  const { html, robots, noindex } = await buildWith(SYNT, 'klar');
  assert.equal(noindex, false);
  assert.doesNotMatch(html, /noindex|Kommer snart/);
  assert.doesNotMatch(robots, /Disallow/);
  for (const url of [SYNT.newsletter.url, SYNT.loyalty.url]) assert.ok(html.includes(`href="${url}"`), url);
  for (const a of html.match(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) assert.match(a, /rel="noopener noreferrer"/, a);
  assert.match(html, /Gå med i kundklubben/);
  assert.match(html, /Hämta stämpelkort/);
});

test('http, javascript: och andra adresser avvisas av bygget', async () => {
  const bad = ['http://kundklubb.example/', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//kundklubb.example/', 'ftp://kundklubb.example/',
    'https://kundklubb.example/"><script>', 'https://user:pw@kundklubb.example/', ' https://kundklubb.example/', 'https://localhost/', 'kundklubb.example', 42];
  for (const url of bad) {
    assert.throws(() => checkUrl('newsletter', url), undefined, String(url));
    await assert.rejects(build({ out: path.join(tmp, 'fel'), config: { newsletter: { url }, loyalty: SYNT.loyalty } }), undefined, String(url));
  }
  assert.equal(checkUrl('loyalty', 'https://stampel.example/kort?a=1&b=2'), 'https://stampel.example/kort?a=1&b=2');
});

test('dist: inga externa resurser, inga skript, formulär, kakor eller gästuppgiftsfält', async () => {
  const { out } = await build({ out: path.join(tmp, 'skanna'), config: SYNT });
  const all = await files(out);
  assert.ok(!all.some(f => /\.(js|mjs)$/.test(f)), 'inga skriptfiler');
  for (const f of all.filter(f => /\.(html|css|webmanifest|txt)$/.test(f) && !/OFL-/.test(f))) {
    const text = await readFile(f, 'utf8');
    assert.doesNotMatch(text, /<(script|iframe|form|input|textarea|select|object|embed|frame|button)\b/i, f);
    assert.doesNotMatch(text, /\bsrc\s*=\s*["']?(https?:)?\/\//i, f);
    assert.doesNotMatch(text, /url\(\s*["']?(https?:)?\/\//i, f);
    assert.doesNotMatch(text, /@import|document\.cookie|\son[a-z]+\s*=/i, f);
    for (const m of text.matchAll(/<link\b[^>]*href="([^"]+)"/g)) assert.match(m[1], /^\/(?!\/)/, `${f}: ${m[1]}`);
    for (const m of text.matchAll(/"src"\s*:\s*"([^"]+)"/g)) assert.match(m[1], /^\/(?!\/)/, `${f}: ${m[1]}`);
  }
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  const external = [...html.matchAll(/href="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(external)].sort(), [MAIN, SYNT.newsletter.url, SYNT.loyalty.url].sort());
  assert.doesNotMatch(html, /\bname="(email|e-post|phone|telefon|namn|name)"/i);
});

test('texter: ansvarig, Brevo, Stampioo, avregistrering, kontakt och huvudsajt; inga priser', async () => {
  const { html } = await buildWith(SYNT, 'text');
  for (const s of ['RODDANS Restaurang AB', '556825-3339', 'Brevo', 'Stampioo', 'integritetspolicy', 'avregistrera', 'info@sandaredskvarterskrog.com', 'tel:+4633255925', 'Alingsåsvägen 6', MAIN]) assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, /\d+\s*(kr|:-)/);
  assert.doesNotMatch(html, /allergen/i);
});
