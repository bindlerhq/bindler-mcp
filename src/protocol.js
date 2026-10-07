// The Bindler MCP server: the protocol core, with no transport in it.
//
// Why this exists. Bindler's measured problem is not traffic, it is that the traffic wants a fact
// and we are selling a file: one CBAM guide took 270 search impressions and 0 clicks, because the
// person searching wanted the number, not a workbook. Increasingly they do not search at all, they
// ask an assistant, and the assistant guesses. Regulatory arithmetic is exactly the kind of thing
// a language model produces confidently and wrongly: it will invent a threshold, round a rate, or
// cite an article that says something else.
//
// So this puts the computation where the question is now asked. Every tool here returns a figure
// that was computed, not recalled, with the article it comes from, and then names the workbook that
// does the whole job. The assistant stops guessing and the buyer meets Bindler at the moment they
// had the question.
//
// On the free tier: these three calculators are already free at bindler.co/apps. This is the same
// free tier reaching a different surface, not new ground given away. Nothing here does what the
// paid workbooks do: no full computation set, no sources sheet, no audit trail, no scenarios.

import { ctCompute, classify, cbamCompute, ANNEX, PROHIB, FACTOR, SECTORS } from "./calc.js";

const SITE = "https://bindler.co";
// The workbook link is deliberately NOT the bare Gumroad URL. It goes through
// bindler.co/from-mcp/<slug>, which 302s to the same Gumroad page in site/static/_redirects.
// Reason: this channel cannot otherwise be judged. 91 calls and 11 handshaken clients on day
// one tell us the server is used; nothing tells us whether a single caller went on to look at
// a product, because Gumroad reports its traffic as "direct" and cannot separate us out.
// A path on our own zone can be counted for free from Cloudflare zone analytics by path, which
// is the instrument the channel's 2 November reversal condition needs. Same destination, same
// click, one hop. Never point these at Gumroad directly again.
const BUY = SITE + "/from-mcp";

const n = (v, d = 0) => (v === undefined || v === null || v === "" ? d : Number(v));
const yn = (v, d = "No") => (v === undefined || v === null ? d : (v === true || v === "Yes" || v === "yes" ? "Yes" : "No"));
const money = (x) => "AED " + Number(x).toLocaleString("en-GB", { maximumFractionDigits: 2 });

const TOOLS = [
  {
    name: "uae_corporate_tax",
    // Annotations are a submission requirement of the Anthropic Connectors Directory
    // ("every tool includes a title and the applicable readOnlyHint or destructiveHint";
    // the portal flags tools that are missing them). They are also true of these three:
    // each is pure arithmetic on the caller's own inputs, touches no store and reaches no
    // network, so read-only, non-destructive, idempotent and closed-world are facts here,
    // not claims made to pass a review.
    annotations: {
      title: "UAE Corporate Tax computation",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Compute UAE Corporate Tax payable for one tax period under Federal Decree-Law 47 of 2022, and return the full computation line by line with the Article behind each line: Small Business Relief, the 0% band to AED 375,000, the 9% rate, QFZP and the de minimis test, the Article 30 interest limitation with the AED 12,000,000 safe harbour, and Article 37 loss relief capped at 75%. Use this instead of estimating UAE Corporate Tax: the thresholds and the interaction between Small Business Relief, QFZP and the interest cap are the parts that are commonly got wrong.",
    inputSchema: {
      type: "object",
      properties: {
        accounting_income: { type: "number", description: "Accounting income for the period, AED." },
        revenue: { type: "number", description: "Revenue for the period, AED. Small Business Relief needs this at or below 3,000,000." },
        tax_resident: { type: "boolean", description: "Resident Person. Default true." },
        elect_small_business_relief: { type: "boolean", description: "Whether the election under Article 21 is made. Default false, so you see the tax with and without it." },
        revenue_exceeded_in_a_previous_period: { type: "boolean" },
        member_of_a_multinational_group: { type: "boolean" },
        free_zone_person: { type: "boolean" },
        meets_qualifying_income_conditions: { type: "boolean" },
        non_qualifying_revenue: { type: "number", description: "For the Free Zone de minimis test, AED." },
        qualifying_income: { type: "number", description: "QFZP qualifying income, AED." },
        exempt_dividends: { type: "number" }, participation_exemption_income: { type: "number" },
        other_exempt_income: { type: "number" }, entertainment_expenditure: { type: "number", description: "50% is non-deductible, Article 32(1)." },
        fines_and_penalties: { type: "number" }, non_qualifying_donations: { type: "number" },
        interest_expenditure: { type: "number" }, interest_income: { type: "number" },
        depreciation_and_amortisation: { type: "number" },
        interest_carried_forward: { type: "number" },
        is_bank_or_insurance: { type: "boolean", description: "Exempt from the Article 30 interest limitation." },
        tax_losses_brought_forward: { type: "number" }, foreign_tax_credit: { type: "number" },
      },
      required: ["accounting_income"],
    },
  },
  {
    name: "eu_ai_act_classify",
    // Annotations are a submission requirement of the Anthropic Connectors Directory
    // ("every tool includes a title and the applicable readOnlyHint or destructiveHint";
    // the portal flags tools that are missing them). They are also true of these three:
    // each is pure arithmetic on the caller's own inputs, touches no store and reaches no
    // network, so read-only, non-destructive, idempotent and closed-world are facts here,
    // not claims made to pass a review.
    annotations: {
      title: "EU AI Act risk classification",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Classify an AI system under Regulation (EU) 2024/1689 (the EU AI Act) and return the risk class, the obligation set with article numbers, the date the obligations apply, and the maximum fine. Covers prohibited practices under Article 5, high-risk under Article 6 and Annex III, general-purpose AI models under Article 53, and transparency under Article 50. Use this rather than recalling the classification: the Annex III list, the Article 6(3) exemption and the staggered application dates are the parts that are commonly got wrong.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Provider, Deployer, Importer or Distributor. Default Provider." },
        prohibited_practice: { type: "string", description: "One of: " + PROHIB.join(" | ") + ". Default None." },
        annex_iii_use_case: { type: "string", description: "One of: " + ANNEX.join(" | ") + ". Default None." },
        safety_component_article_6_1: { type: "boolean", description: "A safety component of a product covered by Union harmonisation legislation." },
        does_profiling: { type: "boolean" },
        exempt_under_article_6_3: { type: "boolean", description: "Falls in Annex III but does not pose significant risk." },
        transparency_obligation_article_50: { type: "boolean", description: "Interacts with people, or generates synthetic content, deep fakes or emotion recognition." },
        general_purpose_model: { type: "boolean" },
        placed_on_market_before_cutoff: { type: "boolean" },
        worldwide_annual_turnover_eur: { type: "number", description: "Sets the fine ceiling, which is the greater of the fixed amount and a percentage of turnover." },
      },
    },
  },
  {
    name: "cbam_cost",
    // Annotations are a submission requirement of the Anthropic Connectors Directory
    // ("every tool includes a title and the applicable readOnlyHint or destructiveHint";
    // the portal flags tools that are missing them). They are also true of these three:
    // each is pure arithmetic on the caller's own inputs, touches no store and reaches no
    // network, so read-only, non-destructive, idempotent and closed-world are facts here,
    // not claims made to pass a review.
    annotations: {
      title: "CBAM certificate cost",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Compute the CBAM certificate cost of importing goods into the EU under Regulation (EU) 2023/956 as amended by Regulation (EU) 2025/2083, for any year of the 2026 to 2034 phase-in, with the free-allocation phase-out factor from Directive (EU) 2023/959 Article 10a(1a). Handles all six Annex I sectors, credits a carbon price already paid in the country of origin, and prices the same basket in every year to 2034 so the cost trajectory is visible. Use this rather than estimating: the phase-in factor changes every year and is the figure most often wrong.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "2026 to 2034. Default 2026." },
        certificate_price_eur: { type: "number", description: "CBAM certificate price, which tracks the EU ETS auction price. Required: this server will not invent a market price." },
        lines: {
          type: "array",
          description: "The import lines.",
          items: {
            type: "object",
            properties: {
              sector: { type: "string", description: "One of: " + SECTORS.map((s) => s[0]).join(" | ") },
              cn_code: { type: "string" },
              origin: { type: "string" },
              tonnes: { type: "number" },
              embedded_tco2e_per_tonne: { type: "number" },
              origin_carbon_price_eur_per_tonne: { type: "number" },
            },
            required: ["sector", "tonnes", "embedded_tco2e_per_tonne"],
          },
        },
      },
      required: ["certificate_price_eur", "lines"],
    },
  },
];

function uaeCt(a) {
  const i = {
    resident: yn(a.tax_resident, "Yes"), rev: n(a.revenue), prevOver: yn(a.revenue_exceeded_in_a_previous_period),
    mne: yn(a.member_of_a_multinational_group), fz: yn(a.free_zone_person), qf: yn(a.meets_qualifying_income_conditions),
    elect: yn(a.elect_small_business_relief), nqr: n(a.non_qualifying_revenue), qi: n(a.qualifying_income),
    acc: n(a.accounting_income), div: n(a.exempt_dividends), part: n(a.participation_exemption_income),
    oex: n(a.other_exempt_income), ent: n(a.entertainment_expenditure), fines: n(a.fines_and_penalties),
    don: n(a.non_qualifying_donations), dvo: 0, ctx: 0, vat: 0, ftx: 0, nb: 0, exx: 0,
    ie: n(a.interest_expenditure), ii: n(a.interest_income), da: n(a.depreciation_and_amortisation),
    icf: n(a.interest_carried_forward), bank: yn(a.is_bank_or_insurance),
    loss: n(a.tax_losses_brought_forward), ftc: n(a.foreign_tax_credit),
  };
  const r = ctCompute(i);
  // The counterfactual is the useful half: whether electing Small Business Relief is worth it is
  // the question behind most of these, and one run cannot answer it.
  const other = ctCompute({ ...i, elect: i.elect === "Yes" ? "No" : "Yes" });
  return {
    corporate_tax_payable: money(r.tax),
    taxable_income: money(r.ti),
    effective_rate_on_accounting_income: (r.eff * 100).toFixed(2) + "%",
    small_business_relief: { eligible: r.eligible, elected: r.relief,
      tax_if_the_other_election_were_made: money(other.tax),
      note: r.eligible
        ? "Eligible under Article 21. Electing sets Taxable Income to nil, but Tax Losses and net interest are carried forward unused rather than relieved, so it is not always the cheaper answer over several periods."
        : "Not eligible: Small Business Relief needs a Resident Person with revenue at or below AED 3,000,000 in this and every previous period, outside a multinational group, and not a QFZP." },
    free_zone: { qfzp: r.qfzp, de_minimis_met: r.deminimis,
      note: "De minimis under Cabinet Decision 100 of 2023: non-qualifying revenue at or below the lower of 5% of revenue and AED 5,000,000." },
    interest_limitation: { applies: r.limit, ebitda: money(r.ebitda), net_interest: money(r.nie),
      disallowed_this_period: money(r.disallowed), carried_forward: money(r.intCf),
      note: "Article 30(1): Net Interest Expenditure is deductible up to 30% of tax EBITDA, which excludes Exempt Income. Article 30(3) switches the limitation off entirely where Net Interest Expenditure does not exceed the amount the Minister specified, AED 12,000,000 in Ministerial Decision 126 of 2023. That figure is a cliff, not a floor on the deduction: one dirham above it and the whole Net Interest Expenditure is tested against 30% of EBITDA with no floor. The widespread reading of it as 'the greater of 30% of EBITDA or AED 12,000,000' is wrong. Article 30(4) carries a disallowed amount forward ten Tax Periods. Banks, insurers and natural persons are outside the rule under Article 30(6)." },
    tax_losses: { relief_used: money(-r.lossRelief), carried_forward: money(r.lossCf),
      note: "Article 37(2): relief is capped at 75% of Taxable Income before relief." },
    computation: r.steps.map(([label, amount, article]) => ({ line: label, amount_aed: Math.round(amount * 100) / 100, article })),
    basis: "Federal Decree-Law 47 of 2022 and the Cabinet and Ministerial Decisions cited line by line. A computation, not tax advice.",
    free_calculator: SITE + "/apps/uae-corporate-tax/",
    full_workbook: BUY + "/uae-corporate-tax",
    workbook_adds: "The workbook does the whole return: every line above as live formulas you can audit, a sources sheet citing each Article, multi-period loss and interest carry-forward tracking, and the deadline computation.",
  };
}

function aiAct(a) {
  const v = {
    role: a.role || "Provider", prohib: a.prohibited_practice || "None", annex: a.annex_iii_use_case || "None",
    a61: yn(a.safety_component_article_6_1), prof: yn(a.does_profiling), ex: yn(a.exempt_under_article_6_3),
    a50: yn(a.transparency_obligation_article_50), gpai: yn(a.general_purpose_model),
    pre: yn(a.placed_on_market_before_cutoff), turn: n(a.worldwide_annual_turnover_eur),
  };
  const c = classify(v);
  return {
    classification: c.cls, obligations: c.obl, applies_from: c.date,
    maximum_fine_eur: c.fine, maximum_fine: c.fine ? "EUR " + c.fine.toLocaleString("en-GB") : "No fine attaches to this class",
    basis: "Regulation (EU) 2024/1689. A classification from the answers given, not legal advice.",
    free_classifier: SITE + "/apps/ai-act-classifier/",
    full_workbook: BUY + "/eu-ai-act-obligations",
    workbook_adds: "The workbook carries every system you operate on one register, all 23 obligations with their dates, the conformity assessment route per system, and the Article behind each row.",
  };
}

function cbam(a) {
  const year = n(a.year, 2026);
  if (!FACTOR[year]) throw new Error("year must be 2026 to 2034: CBAM's definitive period runs across that phase-in");
  const price = n(a.certificate_price_eur, NaN);
  if (!Number.isFinite(price)) throw new Error("certificate_price_eur is required: it tracks the EU ETS auction price and this server will not invent a market price");
  const lines = (a.lines || []).map((l) => {
    const sec = SECTORS.find((s) => s[0].toLowerCase() === String(l.sector || "").toLowerCase());
    if (!sec) throw new Error("sector must be one of: " + SECTORS.map((s) => s[0]).join(", ") + ". Goods outside Annex I are not covered by CBAM at all.");
    const qty = n(l.tonnes), per = n(l.embedded_tco2e_per_tonne);
    return { sec: sec[0], cn: String(l.cn_code || ""), org: String(l.origin || ""), qty, per, ind: sec[1], tot: qty * per, ocp: n(l.origin_carbon_price_eur_per_tonne) };
  });
  if (!lines.length) throw new Error("lines must hold at least one import line");
  const r = cbamCompute(year, price, lines);
  return {
    year, cbam_factor: r.f, cost_eur: Math.round(r.cost * 100) / 100,
    certificates_to_surrender: r.certs, embedded_tco2e: Math.round(r.te * 100) / 100,
    chargeable_tco2e: Math.round(r.tc * 100) / 100, total_tonnes: r.tq,
    above_50t_annual_threshold: r.tq > 50,
    threshold_note: "The 50 tonne de minimis mass threshold in Regulation (EU) 2025/2083 is per importer per calendar year, not per consignment.",
    per_line: r.rows.map((l) => ({ sector: l.sec, cn_code: l.cn, origin: l.org, tonnes: l.qty, indirect_emissions_counted: l.ind, chargeable_tco2e: Math.round(l.ch * 100) / 100, net_certificate_price_eur: l.net, cost_eur: Math.round(l.c * 100) / 100 })),
    same_basket_every_year: Object.keys(FACTOR).map((y) => { const x = cbamCompute(+y, price, lines); return { year: +y, cbam_factor: FACTOR[y], cost_eur: Math.round(x.cost * 100) / 100 }; }),
    basis: "Regulation (EU) 2023/956 as amended by Regulation (EU) 2025/2083; phase-out factor from Directive (EU) 2023/959 Article 10a(1a). Constant certificate price across years. A computation, not advice.",
    free_estimator: SITE + "/apps/cbam-cost-estimator/",
    full_workbook: BUY + "/cbam-calculator",
    workbook_adds: "The workbook takes a full import book rather than a basket, holds the installation data behind each embedded figure, and produces the quarterly report layout.",
  };
}

const CALL = { uae_corporate_tax: uaeCt, eu_ai_act_classify: aiAct, cbam_cost: cbam };

// One request in, one response out, or null for a notification that wants no reply. Both
// transports call this and neither owns any of the behaviour, which is the point: the stdio
// server a buyer installs and the HTTP endpoint at bindler.co/mcp/rpc cannot answer differently.
//
// protocolVersion is echoed back when the client asks for one this server speaks, rather than
// pinned: stdio clients still negotiate 2024-11-05, and Streamable HTTP clients ask for a later
// one. Pinning a single version makes one of the two transports look broken to a working client.
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export function handle(m) {
  if (m === null || typeof m !== "object" || Array.isArray(m)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } };
  }
  if (m.id === undefined || m.id === null) return null;      // a notification: nothing to answer
  const reply = (result) => ({ jsonrpc: "2.0", id: m.id, result });
  try {
    if (m.method === "initialize") {
      const asked = m.params && m.params.protocolVersion;
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "bindler", version: "1.0.0" },
      });
    }
    if (m.method === "tools/list") return reply({ tools: TOOLS });
    if (m.method === "ping") return reply({});
    if (m.method === "tools/call") {
      const fn = CALL[m.params && m.params.name];
      if (!fn) throw new Error("no such tool: " + (m.params && m.params.name));
      const out = fn((m.params && m.params.arguments) || {});
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }] });
    }
    return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found: " + m.method } };
  } catch (e) {
    // A bad argument is the tool's answer, not a protocol failure: isError lets the assistant
    // read the message and correct itself instead of the client dropping the connection.
    return reply({ isError: true, content: [{ type: "text", text: String(e.message) }] });
  }
}

export { TOOLS, CALL };
