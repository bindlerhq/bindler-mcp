import { onRequest } from "../../functions/mcp/rpc.js";
const env = {};                                  // no KV: the free-tier counter is a no-op locally
const post = (body) => onRequest({ request: new Request("https://bindler.co/mcp/rpc", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env });

let fails = 0, checks = 0;
const eq = (label, got, want) => { checks++;
  if (JSON.stringify(got) === JSON.stringify(want)) console.log("OK  " + label + " = " + JSON.stringify(got));
  else { console.log("FAIL " + label + ": got " + JSON.stringify(got) + ", expected " + JSON.stringify(want)); fails++; } };

// 1. initialize, and the version echo
let r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
let j = await r.json();
eq("initialize status", r.status, 200);
eq("protocolVersion echoed", j.result.protocolVersion, "2025-06-18");
eq("serverInfo name", j.result.serverInfo.name, "bindler");
r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
eq("old version echoed too", (await r.json()).result.protocolVersion, "2024-11-05");
r = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
eq("unknown version falls back to latest", (await r.json()).result.protocolVersion, "2025-06-18");

// 2. tools/list
r = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
j = await r.json();
eq("three tools", j.result.tools.map(t => t.name), ["uae_corporate_tax", "eu_ai_act_classify", "cbam_cost"]);

// 3. tools/call: UAE CT on AED 600,000 of accounting income, no adjustments.
// Worked by hand from Federal Decree-Law 47 of 2022: the 0% band is the first AED 375,000
// (Cabinet Decision 116 of 2022) and 9% applies to the excess, so 9% x 225,000 = AED 20,250.
r = await post({ jsonrpc: "2.0", id: 3, method: "tools/call",
  params: { name: "uae_corporate_tax", arguments: { accounting_income: 600000, revenue: 5000000 } } });
j = await r.json();
let out = JSON.parse(j.result.content[0].text);
eq("CT payable on 600,000", out.corporate_tax_payable, "AED 20,250");
eq("taxable income", out.taxable_income, "AED 600,000");
// The workbook link must be the countable path on our own zone, not the bare Gumroad URL:
// that is the whole instrument for this channel, and a well-meant "simplification" back to
// the store URL would silently delete the only evidence the channel sells anything.
eq("names the workbook", out.full_workbook, "https://bindler.co/from-mcp/uae-corporate-tax");

// 4. The Article 30 cliff, which is the defect the book caught on 5 October. Net interest of
// AED 12,000,001 is one dirham over the Ministerial Decision 126 of 2023 amount, so the whole
// net interest is tested against 30% of EBITDA with no floor.
r = await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "uae_corporate_tax",
  arguments: { accounting_income: 10000000, revenue: 50000000, interest_expenditure: 12000001, depreciation_and_amortisation: 0 } } });
out = JSON.parse((await r.json()).result.content[0].text);
eq("interest limitation applies one dirham over", out.interest_limitation.applies, true);
r = await post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "uae_corporate_tax",
  arguments: { accounting_income: 10000000, revenue: 50000000, interest_expenditure: 12000000, depreciation_and_amortisation: 0 } } });
out = JSON.parse((await r.json()).result.content[0].text);
eq("and not at the amount itself", out.interest_limitation.applies, false);

// 5. A bad argument is a tool error, not a protocol error
r = await post({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "cbam_cost", arguments: { year: 2026 } } });
j = await r.json();
eq("missing certificate price is isError", j.result.isError, true);
eq("and says why", /will not invent a market price/.test(j.result.content[0].text), true);

// 6. Unknown method, unknown tool
r = await post({ jsonrpc: "2.0", id: 7, method: "resources/list" });
eq("unknown method is -32601", (await r.json()).error.code, -32601);
r = await post({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "nope" } });
eq("unknown tool is a tool error", (await r.json()).result.isError, true);

// 7. A notification gets 202 and no body; a batch gets an array
r = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
eq("notification status", r.status, 202);
eq("notification body empty", await r.text(), "");
r = await post([{ jsonrpc: "2.0", id: 9, method: "ping" }, { jsonrpc: "2.0", id: 10, method: "tools/list" }]);
j = await r.json();
eq("batch returns two", j.map(x => x.id), [9, 10]);

// 8. GET is 405 with the add line, OPTIONS is 204 with CORS
r = await onRequest({ request: new Request("https://bindler.co/mcp/rpc"), env });
eq("GET status", r.status, 405);
eq("GET names the add command", (await r.json()).add_to_claude_code, "claude mcp add --transport http bindler https://bindler.co/mcp/rpc");
r = await onRequest({ request: new Request("https://bindler.co/mcp/rpc", { method: "OPTIONS" }), env });
eq("OPTIONS status", r.status, 204);
eq("CORS open", r.headers.get("access-control-allow-origin"), "*");

// 9. Malformed body
r = await onRequest({ request: new Request("https://bindler.co/mcp/rpc", { method: "POST", body: "not json" }), env });
j = await r.json();
eq("parse error status", r.status, 400);
eq("parse error code", j.error.code, -32700);

// 10. The three ways the gate can refuse a tools/call must read as three different things.
// Added 6 Oct 2026: every refusal used to come back as "your free tier is used up", so a buyer
// whose key could not be verified was told to go and buy the thing they already owned.
const KEY = "AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD";      // licence-shaped, not a real key
const call = (body, e, hdrs = {}) => onRequest({ request: new Request("https://bindler.co/mcp/rpc", {
  method: "POST", headers: { "content-type": "application/json", ...hdrs }, body: JSON.stringify(body) }), env: e });
const CALL = { jsonrpc: "2.0", id: 20, method: "tools/call",
  params: { name: "uae_corporate_tax", arguments: { accounting_income: 600000, revenue: 5000000 } } };
const realFetch = globalThis.fetch;

// 503: Gumroad did not answer at all. The key is not written off and the buyer is told to retry.
let puts = [];
const kv = { get: async () => null, put: async (k, v) => { puts.push(k + "=" + v); } };
globalThis.fetch = async () => { throw new Error("connection timed out"); };
r = await call(CALL, { REMOTE_KV: kv }, { "x-api-key": KEY });
j = await r.json();
eq("unverifiable key is a tool error", j.result.isError, true);
eq("and says the check was unreachable", /could not reach its licence check/.test(j.result.content[0].text), true);
eq("and does not tell the buyer to buy it again", /one-off purchase/.test(j.result.content[0].text), false);
eq("and caches no verdict", puts, []);

// 401: Gumroad answered and the key is not ours.
globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { headers: { "content-type": "application/json" } });
r = await call(CALL, { REMOTE_KV: kv }, { "x-api-key": KEY });
j = await r.json();
eq("rejected key says not recognised", /was not recognised/.test(j.result.content[0].text), true);
eq("and that verdict is cached", puts.length, 1);

// 200: Gumroad answered yes, so the call goes through and returns the computation.
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, purchase: { refunded: false } }), { headers: { "content-type": "application/json" } });
r = await call(CALL, { REMOTE_KV: { get: async () => null, put: async () => {} } }, { "x-api-key": KEY });
out = JSON.parse((await r.json()).result.content[0].text);
eq("a good key computes", out.corporate_tax_payable, "AED 20,250");

// 429: no key, and the free counter is already past the daily limit.
globalThis.fetch = realFetch;
r = await call(CALL, { REMOTE_KV: { get: async () => "26:0", put: async () => {} } });
j = await r.json();
eq("free tier exhausted says so", /free tier is used up/.test(j.result.content[0].text), true);
eq("and that is the one that sells", /one-off purchase/.test(j.result.content[0].text), true);

console.log(fails ? "\n" + fails + " FAILED of " + checks : "\nALL OK, " + checks + " checks");
process.exit(fails ? 1 : 0);
