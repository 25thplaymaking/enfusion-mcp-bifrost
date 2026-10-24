// One-shot local receiver for scripts/capture-wiki.browser.js. The browser
// delivers the capture as a form POST (field "data"); this writes the decoded
// JSON to argv[2] and exits. Exits on its own after 30 idle minutes.
//
//   node scripts/wiki-capture-receiver.mjs <out.json>
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/wiki-capture-receiver.mjs <out.json>");
  process.exit(1);
}
let idle = setTimeout(() => process.exit(2), 30 * 60_000);

const server = createServer((req, res) => {
  clearTimeout(idle);
  idle = setTimeout(() => process.exit(2), 30 * 60_000);
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/save") {
      const isForm = String(req.headers["content-type"]).startsWith("application/x-www-form-urlencoded");
      const json = isForm ? new URLSearchParams(body).get("data") ?? "" : body;
      writeFileSync(out, json, "utf8");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`saved ${json.length} chars to ${out}`);
      server.close();
      setTimeout(() => process.exit(0), 200);
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
});
server.listen(47811, "127.0.0.1", () => console.log("listening on 127.0.0.1:47811"));
