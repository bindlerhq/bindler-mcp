#!/usr/bin/env node
// The Bindler MCP server, stdio transport.
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
//
// The protocol and the three tools live in protocol.js, which has no transport in it. This file is
// only the newline-delimited JSON-RPC pipe a locally installed client speaks; the same core answers
// over HTTP at bindler.co/mcp/rpc for clients that would rather add a URL than install anything.
// Keeping one core was not tidiness: two copies of a tax computation is two answers to one
// question, and the whole promise here is that the number is the same wherever it is asked.

import { handle } from "./protocol.js";

function send(m) { process.stdout.write(JSON.stringify(m) + "\n"); }
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    const out = handle(m);
    if (out) send(out);
  }
});
