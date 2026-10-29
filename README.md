# Kundklubbssida – Sandareds kvarterskrog & pizzeria

Fristående statisk sida (en HTML-sida, en CSS-fil, inget JavaScript) med två knappar som länkar till tjänsternas egna sidor: **Gå med i kundklubben** (restaurangens anmälningsformulär hos Brevo) och **Hämta stämpelkort** (restaurangens sida hos Stampioo). Principerna i Eleva CRM-repots `docs/KUNDKLUBB-PLAN.md` är bindande.

> **Utkast.** Texterna på sidan är utkast tills restaurangen har godkänt dem och en jurist har läst dem. Brevo och Stampioo är förslag att pröva, inga val; inga avtal finns.

## Ansvar

- **RODDANS Restaurang AB** äger kundklubben och stämpelkortet, har kontona hos Brevo och Stampioo i eget namn och är personuppgiftsansvarig.
- **Eleva** bygger sidan. Eleva har inga lösenord, konton eller API-nycklar hos tjänsterna och behandlar inga gästuppgifter.
- **Sidan samlar aldrig in något:** inga formulär, inga kakor, ingen statistik, inga externa skript, typsnitt, bilder eller iframes. CSP i `vercel.json`: `default-src 'self'`, `form-action 'none'`, `connect-src 'none'`, `frame-ancestors 'none'`.

## Lägga in länkarna

Länkarna står i `kundklubb.config.json` (`newsletter.url`, `loyalty.url`). Restaurangen lämnar adresserna när de har skapat och godkänt sina sidor hos tjänsterna (steg 5–6 i planen).

- Saknas en adress, är den tom eller en platshållare (`[...]`) visas knappen inaktiv med texten "Kommer snart" och utan länk, och sidan får `noindex` och en stängd `robots.txt`.
- Bara `https://` godtas. `http:`, `javascript:`, `data:`, adresser utan protokoll, inloggningsuppgifter i adressen och konstiga tecken stoppar bygget.
- Externa länkar får `rel="noopener noreferrer"`.

`node scripts/bygg.mjs` skriver `dist/` (som inte ligger i Git). Repot är ett eget Vercel-projekt med repots rot som rotkatalog (Framework "Other"); `ignoreCommand` hoppar över bygget när inget har ändrats. Sidan har också en kopia i Eleva-Sites, `sajter/sandared-kundklubb/`. Inget Vercel-projekt är skapat.

## Filer

```
kundklubb.config.json   länkarna (platshållare tills restaurangen lämnat adresser)
src/index.html          sidan med markörer för knapparna och robots
src/css/kundklubb.css   färger och typsnitt från huvudsajten
src/site.webmanifest    ikoner
assets/                 ikoner, logotyp och typsnitt (med OFL-licenser) från referenssajten
scripts/bygg.mjs        bygget, utan npm-paket
tests/                  node --test
vercel.json             bygg, headers, CSP och ignoreCommand
```

## Kontroller

`npm test` (inga beroenden): CSP oförändrad och strikt, platshållare ger ingen länk och ger noindex, otillåtna adresser avvisas, rel-attribut finns, inga externa resurser, skript, formulär eller gästuppgiftsfält i `dist/`, och texterna nämner ansvarig, Brevo, Stampioo, avregistrering och kontakt. Testerna använder bara syntetiska adresser under `.example`. Ett lyckat test godkänner inte texterna, avtalen eller någon grind.
