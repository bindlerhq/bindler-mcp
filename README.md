# Bindler MCP

**Regulatory arithmetic your assistant currently guesses at, computed, with the article it comes from.**

Ask any assistant what UAE Corporate Tax is due on AED 600,000 of profit and it will produce a
number. Sometimes the number is right. It will not tell you which of those times it was, and it
will not show you Cabinet Decision 116 of 2022 or Article 3(1)(b). The parts that are actually hard
are the interactions: whether Small Business Relief is worth electing once you account for the
losses you stop being able to relieve, whether the Article 30 interest cap bites or the AED
12,000,000 safe harbour covers you, whether Annex III makes your hiring tool high-risk or Article
6(3) lets you out.

This is an MCP server that computes those answers instead of recalling them.

```
uae_corporate_tax   Federal Decree-Law 47 of 2022: the whole computation, line by line, with the
                    Article against each line. Small Business Relief and the counterfactual if you
                    elected the other way, the 0% band, QFZP and de minimis, the Article 30
                    interest limitation, Article 37 loss relief capped at 75%.

eu_ai_act_classify  Regulation (EU) 2024/1689: risk class, the obligation set with article
                    numbers, the date it applies, the fine ceiling. Article 5 prohibitions,
                    Article 6 and Annex III high-risk, Article 6(3) exemption, GPAI, Article 50.

cbam_cost           Regulation (EU) 2023/956 as amended by 2025/2083: certificate cost for any
                    year of the 2026 to 2034 phase-in, all six Annex I sectors, origin carbon
                    price credited, and the same basket priced in every year to 2034.

csrd_scope          Directive (EU) 2022/2464 as amended by 2025/794 and Omnibus I 2026/470:
                    whether CSRD applies, per financial year, with the size test and the
                    third-country test shown separately, the ESRS set and the assurance level.
```

## Add it

Hosted, nothing to install:

```bash
claude mcp add --transport http bindler https://bindler.co/mcp/rpc
```

Or in any MCP client that takes a URL:

```json
{ "mcpServers": { "bindler": { "type": "http", "url": "https://bindler.co/mcp/rpc" } } }
```

The hosted endpoint is free for 25 calls a day per address; past that send a
[Bindler API](https://bindler.co/api/) key in `x-api-key`. The four calculators stay free in the
browser at https://bindler.co/apps/ with no key at all.

Locally over stdio, from a clone of this directory:

```bash
node src/server.js
```

`npx -y bindler-mcp` is **not** published and will not resolve. npm's signup page and GitHub's both
answer 403 behind the same bot challenge, so the package is waiting on an account; the hosted
endpoint needs none and reaches more clients. Both transports run the same `src/protocol.js`, so
they cannot answer the same question differently.

No key, no account, no network call. It computes locally and it is MIT licensed.

## What it will not do

It will not invent a market price. CBAM certificates track the EU ETS auction price, so
`certificate_price_eur` is required and there is no default, because a default would be a made-up
number sitting inside a real computation where nobody would spot it.

It will not accept a year outside the 2026 to 2034 phase-in, and for goods outside CBAM Annex I it
says they are outside Annex I rather than returning a zero. A zero reads as "computed, nothing due".

## Checked, not asserted

`npm test` runs 54 checks: 30 through the stdio server (`test/verify.js`) and 24 through the
hosted HTTP transport (`test/http.js`, which drives `functions/mcp/rpc.js` directly, including the
Article 30 cliff on both sides of it). Every expected figure was worked out by hand from the
instrument and written down before the server was called:

> Taxable Income of AED 600,000. The first AED 375,000 is at 0% under Cabinet Decision 116 of 2022,
> and the excess AED 225,000 at 9% under Article 3(1)(b), so AED 20,250 is payable.

The same compute runs the free calculators at [bindler.co/apps](https://bindler.co/apps) and the
[Bindler API](https://bindler.co/api), where it is recalculated cell by cell against an independent
replica before release.

## Where this stops

These four tools answer one question each, for one period, one system, one basket, one company. They are the
same free tier as the browser calculators at bindler.co, reaching a different surface.

They do not do the job. The job is a return you can file, a register covering every AI system you
operate, an import book rather than a basket: live formulas you can audit, a sources sheet, the
carry-forwards tracked across periods. Each tool names the workbook that does that, and the
workbooks are how this is paid for.

## Licence

MIT. Built in Dubai by [Neil Sangwaiya](https://bindler.co/neil-sangwaiya/).
