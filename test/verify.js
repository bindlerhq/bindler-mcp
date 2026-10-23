// Checked, not asserted. Expected figures worked out by hand from the instrument first.
// Run: node test/verify.js
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "server.js");
let fails = 0, checks = 0;
function eq(label, got, want) {
  checks++;
  if (got === want) console.log("OK  " + label + " = " + got);
  else { console.log("FAIL " + label + ": got " + JSON.stringify(got) + ", expected " + JSON.stringify(want)); fails++; }
}

function rpc(messages) {
  return new Promise((res, rej) => {
    const p = spawn("node", [SERVER]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", rej);
    p.on("close", () => res(out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))));
    for (const m of messages) p.stdin.write(JSON.stringify(m) + "\n");
    p.stdin.end();
  });
}
const call = (name, args, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const body = (r) => JSON.parse(r.result.content[0].text);

const rs = await rpc([
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  // By hand, Federal Decree-Law 47/2022: Taxable Income 600,000. The first 375,000 is at 0%
  // (Cabinet Decision 116 of 2022) and the excess 225,000 at 9% (Art 3(1)(b)) = AED 20,250.
  call("uae_corporate_tax", { accounting_income: 600000, revenue: 2800000 }, 3),
  // Electing Small Business Relief (Art 21) sets Taxable Income to nil, so tax is AED 0.
  call("uae_corporate_tax", { accounting_income: 600000, revenue: 2800000, elect_small_business_relief: true }, 4),
  // Revenue above AED 3,000,000 makes the company ineligible however it answers.
  call("uae_corporate_tax", { accounting_income: 600000, revenue: 3000001, elect_small_business_relief: true }, 5),
  // Art 30 interest limitation: net interest of AED 11,000,000 is under the AED 12,000,000 safe
  // harbour in MD 126/2023, so nothing is disallowed however small EBITDA is.
  call("uae_corporate_tax", { accounting_income: 1000000, revenue: 50000000, interest_expenditure: 11000000 }, 6),
  // Annex III 4(a) recruitment, as provider, not exempt: High-risk. Fine ceiling is the greater
  // of EUR 15,000,000 and 3% of turnover; 3% of 80,000,000 is 2,400,000, so the floor governs.
  call("eu_ai_act_classify", { role: "Provider", annex_iii_use_case: "4(a) Recruitment and selection", worldwide_annual_turnover_eur: 80000000 }, 7),
  // An Article 5 practice outranks everything and carries the EUR 35,000,000 floor.
  call("eu_ai_act_classify", { role: "Provider", prohibited_practice: "5(1)(c) Social scoring", worldwide_annual_turnover_eur: 80000000 }, 8),
  // Nothing ticked is Minimal risk, not prohibited: the default for the Article 5 question must
  // be "None" or every system classifies as banned.
  call("eu_ai_act_classify", { role: "Provider" }, 9),
  // CBAM 2026: 60 t x 1.9 = 114.0 tCO2e; x 0.025 = 2.85 chargeable; x EUR 80 = EUR 228.00.
  call("cbam_cost", { year: 2026, certificate_price_eur: 80, lines: [{ sector: "Iron and steel", tonnes: 60, embedded_tco2e_per_tonne: 1.9 }] }, 10),
  // 2034 is the full rate, factor 1.0: 114.0 x 80 = EUR 9,120.00.
  call("cbam_cost", { year: 2034, certificate_price_eur: 80, lines: [{ sector: "Iron and steel", tonnes: 60, embedded_tco2e_per_tonne: 1.9 }] }, 11),
  // The server must refuse to invent a market price, and refuse a year outside the phase-in.
  call("cbam_cost", { year: 2026, lines: [{ sector: "Cement", tonnes: 1, embedded_tco2e_per_tonne: 1 }] }, 12),
  call("cbam_cost", { year: 2025, certificate_price_eur: 80, lines: [{ sector: "Cement", tonnes: 1, embedded_tco2e_per_tonne: 1 }] }, 13),
  // Goods outside Annex I are not covered by CBAM, and saying so beats returning zero.
  call("cbam_cost", { year: 2026, certificate_price_eur: 80, lines: [{ sector: "Cotton t-shirts", tonnes: 1, embedded_tco2e_per_tonne: 1 }] }, 14),
]);
const by = Object.fromEntries(rs.map((r) => [r.id, r]));

eq("server identifies itself", by[1].result.serverInfo.name, "bindler");
eq("four tools are advertised", by[2].result.tools.length, 4);
eq("every tool carries an input schema", by[2].result.tools.every((t) => t.inputSchema && t.inputSchema.type === "object"), true);

eq("UAE CT on 600,000 with no election", body(by[3]).corporate_tax_payable, "AED 20,250");
eq("UAE CT shows the counterfactual election", body(by[3]).small_business_relief.tax_if_the_other_election_were_made, "AED 0");
eq("UAE CT cites an Article on every computation line", body(by[3]).computation.every((l) => l.article && l.article.length > 3), true);
eq("UAE CT with Small Business Relief elected", body(by[4]).corporate_tax_payable, "AED 0");
eq("SBR ineligible one dirham over the revenue threshold", body(by[5]).small_business_relief.eligible, false);
eq("SBR ineligible means the election does not zero the tax", body(by[5]).corporate_tax_payable, "AED 20,250");
eq("interest under the AED 12m safe harbour is not disallowed", body(by[6]).interest_limitation.disallowed_this_period, "AED 0");
eq("and the limitation is reported as not applying", body(by[6]).interest_limitation.applies, false);

eq("Annex III recruitment is High-risk", body(by[7]).classification, "High-risk");
eq("high-risk fine ceiling takes the EUR 15m floor over 3% of 80m", body(by[7]).maximum_fine_eur, 15000000);
eq("an Article 5 practice is prohibited", body(by[8]).classification, "PROHIBITED (Article 5)");
eq("prohibited carries the EUR 35m floor", body(by[8]).maximum_fine_eur, 35000000);
eq("an unticked system is Minimal risk, not banned", body(by[9]).classification, "Minimal risk");

eq("CBAM 2026 steel cost", body(by[10]).cost_eur, 228);
eq("CBAM 2026 factor", body(by[10]).cbam_factor, 0.025);
eq("CBAM whole certificates surrendered", body(by[10]).certificates_to_surrender, 3);
eq("CBAM prices the same basket out to 2034", body(by[10]).same_basket_every_year.length, 9);
eq("CBAM 2034 full rate", body(by[11]).cost_eur, 9120);
eq("refuses to invent the certificate price", by[12].result.isError, true);
eq("rejects a year outside the phase-in", by[13].result.isError, true);
eq("names the Annex I sectors when given goods outside them", /Annex I/.test(by[14].result.content[0].text), true);

// Every tool must point at the free tool it mirrors and the workbook that does the whole job,
// because a figure with no next step is a fact given away rather than a customer met.
for (const [id, label] of [[3, "UAE CT"], [7, "AI Act"], [10, "CBAM"]]) {
  const b = body(by[id]);
  eq(label + " names its free tool and its workbook",
    !!(b.free_calculator || b.free_classifier || b.free_estimator) && !!b.full_workbook, true);
  eq(label + " states its legal basis", /Regulation|Decree-Law/.test(b.basis), true);
}

// The UAE CT tool also returns the book, and the link must be the countable path on our own zone.
// A bare Gumroad URL here would still sell but could never be attributed, which is how this
// channel went 91 calls with nothing readable against it.
{
  const b = body(by[3]);
  eq("UAE CT names the book", /UAE Corporate Tax: The Computation/.test(b.book && b.book.title), true);
  eq("the book link is countable, not bare Gumroad",
    b.book.url === "https://bindler.co/from-mcp/uae-corporate-tax-book", true);
  eq("the book carries its price", b.book.price, "$6.99");
}

console.log("");
if (fails) { console.log(fails + " of " + checks + " FAILED"); process.exit(1); }
console.log("ALL OK, " + checks + " checks");
