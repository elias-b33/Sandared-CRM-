// Bygger kundklubbssidan till dist/. Inga npm-paket, inget JS i sidan.
// Spärr: en länk som saknas eller är en platshållare blir en inaktiv knapp ("Kommer snart")
// och sidan får noindex. Bara https:// godtas; allt annat stoppar bygget.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LINKS = {
  newsletter: { label: 'Gå med i kundklubben', marker: '{{NEWSLETTER_BUTTON}}' },
  loyalty: { label: 'Hämta stämpelkort', marker: '{{LOYALTY_BUTTON}}' },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Saknas, tom eller platshållare ([...], "PLATSHÅLLARE", "TODO") räknas som ej inlagd. */
export function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v === '' || /^\[.*\]$/s.test(v) || /platsh[aå]llare|todo/i.test(v);
}

/** Returnerar en giltig https-adress eller null (platshållare). Kastar för allt annat. */
export function checkUrl(name, value) {
  if (isPlaceholder(value)) return null;
  if (typeof value !== 'string') throw new Error(`${name}.url måste vara en sträng`);
  const raw = value.trim();
  if (raw !== value || /[\s"'<>`\\]/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error(`${name}.url innehåller otillåtna tecken`);
  let u;
  try { u = new URL(raw); } catch { throw new Error(`${name}.url är ingen giltig adress: ${raw}`); }
  if (u.protocol !== 'https:' || !/^https:\/\//i.test(raw)) throw new Error(`${name}.url måste börja med https:// (fick ${u.protocol})`);
  if (u.username || u.password) throw new Error(`${name}.url får inte innehålla inloggningsuppgifter`);
  if (!u.hostname.includes('.')) throw new Error(`${name}.url saknar ett riktigt värdnamn`);
  return u.href;
}

export function button(label, url) {
  if (!url) {
    return `<span class="btn btn--disabled" aria-disabled="true">${esc(label)} <span class="btn__soon">Kommer snart</span></span>`;
  }
  return `<a class="btn btn--primary" href="${esc(url)}" rel="noopener noreferrer">${esc(label)}</a>`;
}

export function render(template, config) {
  if (!config || typeof config !== 'object') throw new Error('Konfigurationen saknas');
  let html = template;
  let anyPlaceholder = false;
  for (const [key, { label, marker }] of Object.entries(LINKS)) {
    const url = checkUrl(key, config[key]?.url);
    if (!url) anyPlaceholder = true;
    if (!html.includes(marker)) throw new Error(`Mallen saknar ${marker}`);
    html = html.replace(marker, button(label, url));
  }
  html = html.replace('{{ROBOTS}}', anyPlaceholder ? '<meta name="robots" content="noindex, nofollow">' : '');
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Mallen har kvar okända markörer');
  return { html, noindex: anyPlaceholder };
}

export async function build({ root = ROOT, out = path.join(root, 'dist'), config } = {}) {
  config ??= JSON.parse(await readFile(path.join(root, 'kundklubb.config.json'), 'utf8'));
  const template = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  const { html, noindex } = render(template, config);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'assets', 'css'), { recursive: true });
  for (const dir of ['icons', 'img', 'fonts']) {
    await cp(path.join(root, 'assets', dir), path.join(out, 'assets', dir), { recursive: true });
  }
  await cp(path.join(root, 'src', 'css', 'kundklubb.css'), path.join(out, 'assets', 'css', 'kundklubb.css'));
  await cp(path.join(root, 'src', 'site.webmanifest'), path.join(out, 'site.webmanifest'));
  await writeFile(path.join(out, 'index.html'), html);
  await writeFile(path.join(out, 'robots.txt'), noindex ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n');
  return { out, noindex };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { out, noindex } = await build();
    console.log(`Byggt till ${path.relative(process.cwd(), out) || out}${noindex ? ' (noindex: minst en länk är platshållare)' : ''}`);
  } catch (err) {
    console.error(`Bygget stoppades: ${err.message}`);
    process.exit(1);
  }
}
