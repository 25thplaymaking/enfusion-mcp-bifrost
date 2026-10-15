/**
 * Browser-side capture of the BI wiki's Arma Reforger namespace (5050) as
 * structured Markdown, for `npm run wiki:update`.
 *
 * community.bistudio.com sits behind a bot challenge, so this must run inside a
 * real browser tab on that origin (DevTools console, or an agent's browser
 * tool). It reads the rendered HTML through the MediaWiki API and keeps what an
 * agent needs to use a page: fenced code blocks with their indentation,
 * tables, headings, lists and note/warning boxes. The previous capture used
 * innerText, which flattened every code sample and turned tables into one cell
 * per line.
 *
 * Usage (in a tab on https://community.bistudio.com):
 *   1. node scripts/wiki-capture-receiver.mjs <out.json>   (local receiver)
 *   2. paste this file, then run:  captureWiki()
 *      Progress is in window.__wikiCapture; the receiver exits once saved.
 *   3. npm run wiki:update -- <out.json>
 */
// eslint-disable-next-line no-unused-vars
async function captureWiki({ endpoint = "http://127.0.0.1:47811/save", delayMs = 400, only = null } = {}) {
  const API = "https://community.bistudio.com/wikidata/api.php";
  const state = (window.__wikiCapture = { done: 0, total: 0, failed: [], status: "listing" });

  const INLINE = new Set(["A", "B", "STRONG", "I", "EM", "SPAN", "CODE", "TT", "KBD", "VAR", "SUP", "SUB",
    "SMALL", "BIG", "U", "S", "ABBR", "IMG", "BR", "FONT", "MARK", "Q", "CITE", "DFN", "SAMP", "TIME"]);
  const SKIP = ".mw-editsection, #toc, .toc, .navbox, script, style, link, meta, noscript, .printfooter, " +
    ".catlinks, button.biki-spoiler, a.bikispoiler-top, .mw-empty-elt, sup.reference, .mw-references-wrap";

  const isBlockCode = (el) =>
    el.matches("pre, div[class*='highlighter-block'], div.mw-highlight, div.mw-code");
  const codeLang = (el) => {
    const c = String(el.className);
    if (/enforce/i.test(c)) return "c";
    if (/sqf/i.test(c)) return "sqf";
    const m = c.match(/mw-highlight-lang-(\w+)/);
    return m ? m[1] : "";
  };
  const codeText = (el) => el.textContent.replace(/\s+$/, "").replace(/^\n+/, "");
  const fence = (el) => {
    const body = codeText(el);
    const ticks = body.includes("```") ? "````" : "```";
    return `${ticks}${codeLang(el)}\n${body}\n${ticks}\n\n`;
  };
  const isInlineNode = (n) =>
    n.nodeType === 3 ||
    (n.nodeType === 1 && INLINE.has(n.tagName) && !n.querySelector("div, p, pre, table, ul, ol, dl, h2, h3, h4"));

  function inline(n, inTable = false) {
    if (n.nodeType === 3) return n.textContent.replace(/\s+/g, " ");
    if (n.nodeType !== 1) return "";
    const tag = n.tagName;
    if (tag === "BR") return inTable ? " " : "\n";
    if (tag === "IMG") return "";
    const kids = () => [...n.childNodes].map((c) => inline(c, inTable)).join("");
    if (tag === "CODE" || tag === "TT" || tag === "KBD" || tag === "VAR" || tag === "SAMP" ||
        (tag === "SPAN" && /highlighter-block/.test(String(n.className)))) {
      const t = n.textContent.replace(/\s+/g, " ").trim();
      return t ? `\`${t.replace(/`/g, "'")}\`` : "";
    }
    if (tag === "B" || tag === "STRONG") { const t = kids().trim(); return t ? `**${t}**` : ""; }
    if (tag === "I" || tag === "EM") { const t = kids().trim(); return t ? `*${t}*` : ""; }
    if (isBlockCode(n)) return ` \`${codeText(n).replace(/\s*\n\s*/g, " ⏎ ")}\` `;
    return kids();
  }

  const indent = (text, depth) =>
    text.split("\n").map((l) => (l ? "  ".repeat(depth) + l : l)).join("\n");

  function list(el, depth) {
    let i = 1;
    let out = "";
    for (const li of el.children) {
      if (li.tagName !== "LI") continue;
      const marker = el.tagName === "OL" ? `${i++}.` : "-";
      let text = "";
      let nested = "";
      for (const ch of li.childNodes) {
        if (ch.nodeType === 1 && (ch.tagName === "UL" || ch.tagName === "OL")) nested += list(ch, depth + 1);
        else if (ch.nodeType === 1 && !isInlineNode(ch)) nested += indent(block(ch).trimEnd(), depth + 1) + "\n";
        else text += inline(ch);
      }
      out += `${"  ".repeat(depth)}${marker} ${text.trim()}\n${nested}`;
    }
    return depth === 0 ? `${out}\n` : out;
  }

  // One-line code samples render fine as inline code inside a table cell.
  function cellIsComplex(c) {
    if (c.querySelector("ul, ol, table, dl")) return true;
    const codes = [...c.querySelectorAll("pre, div[class*='highlighter-block'], div.mw-highlight")];
    if (codes.some((el) => codeText(el).includes("\n"))) return true;
    return c.textContent.trim().split("\n").length > 4;
  }

  function table(t) {
    const rows = [...t.rows].map((tr) => [...tr.cells]);
    if (rows.length === 0) return "";
    const headerRow = rows[0].every((c) => c.tagName === "TH") ? rows[0] : null;
    const body = headerRow ? rows.slice(1) : rows;
    const headers = headerRow ? headerRow.map((c) => inline(c, true).trim()) : null;
    const complex = rows.some((r) => r.some(cellIsComplex));

    if (!complex) {
      const width = Math.max(...rows.map((r) => r.length));
      const fmt = (cells) => {
        const v = cells.map((c) => inline(c, true).trim().replace(/\|/g, "\\|"));
        while (v.length < width) v.push("");
        return `| ${v.join(" | ")} |`;
      };
      const head = headerRow ? fmt(headerRow) : `| ${Array(width).fill(" ").join(" | ")} |`;
      const sep = `| ${Array(width).fill("---").join(" | ")} |`;
      return [head, sep, ...body.map(fmt)].join("\n") + "\n\n";
    }

    // Cells holding code, lists or long text cannot live in a Markdown table:
    // emit one record per row instead, keeping each cell's full structure.
    let out = "";
    for (const r of body) {
      if (r.length === 1 && headers && headers.length > 1) {
        out += `\n**${inline(r[0], true).trim()}**\n\n`;
        continue;
      }
      const parts = r.map((c, i) => {
        const label = headers?.[i] ? `**${headers[i]}**: ` : "";
        const content = cellIsComplex(c) ? `\n${indent(blocks(c).trim(), 1)}` : inline(c, true).trim();
        return `${label}${content}`;
      });
      out += `- ${parts.join(headers ? "\n  " : " | ")}\n`;
    }
    return `${out}\n`;
  }

  function block(el) {
    if (el.nodeType === 3) return el.textContent.trim() ? `${inline(el).trim()}\n\n` : "";
    if (el.nodeType !== 1) return "";
    const tag = el.tagName;
    const h = tag.match(/^H([1-6])$/);
    if (h) {
      const t = el.textContent.replace(/\s+/g, " ").trim();
      return t ? `${"#".repeat(Number(h[1]))} ${t}\n\n` : "";
    }
    if (isBlockCode(el)) return fence(el);
    if (tag === "P") { const t = [...el.childNodes].map((c) => inline(c)).join("").trim(); return t ? `${t}\n\n` : ""; }
    if (tag === "UL" || tag === "OL") return list(el, 0);
    if (tag === "TABLE") return table(el);
    if (tag === "HR") return "---\n\n";
    if (tag === "DL") {
      let out = "";
      for (const c of el.children) {
        if (c.tagName === "DT") out += `**${inline(c).trim()}**\n`;
        else if (c.tagName === "DD") out += `${indent(blocks(c).trim(), 1)}\n`;
      }
      return `${out}\n`;
    }
    if (tag === "BLOCKQUOTE") return blocks(el).trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
    if (el.classList.contains("biki-messagebox")) {
      const kind = (String(el.className).match(/feature-(\w+)/) || [])[1] || "note";
      const label = { warning: "Warning", important: "Important", informative: "Note", arma3: "Note" }[kind] || "Note";
      const content = el.children.length > 1 ? blocks(el.children[1]) : blocks(el);
      return `> **${label}:** ${content.trim().split("\n").join("\n> ")}\n\n`;
    }
    if (tag === "FIGURE" || el.classList.contains("thumb") || el.classList.contains("gallery")) return "";
    if (isInlineNode(el)) { const t = inline(el).trim(); return t ? `${t}\n\n` : ""; }
    return blocks(el);
  }

  function blocks(container) {
    let out = "";
    let para = "";
    const flush = () => { if (para.trim()) out += `${para.trim()}\n\n`; para = ""; };
    for (const ch of container.childNodes) {
      if (isInlineNode(ch)) para += inline(ch);
      else { flush(); out += block(ch); }
    }
    flush();
    return out;
  }

  function convert(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const root = doc.querySelector(".mw-parser-output") || doc.body;
    root.querySelectorAll(SKIP).forEach((e) => e.remove());
    return blocks(root).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const listUrl = `${API}?action=query&generator=allpages&gapnamespace=5050&gapfilterredir=nonredirects` +
    "&gaplimit=500&prop=revisions&rvprop=ids|timestamp&format=json&formatversion=2";
  let pages = [];
  let cont = "";
  for (;;) {
    const r = await fetch(listUrl + cont).then((x) => x.json());
    pages.push(...(r.query?.pages ?? []));
    if (!r.continue) break;
    cont = `&${new URLSearchParams(r.continue)}`;
  }
  if (only) pages = pages.filter((p) => only.includes(p.title.replace(/^Arma Reforger:/, "")));
  state.total = pages.length;
  state.status = "capturing";

  const out = [];
  for (const p of pages) {
    try {
      const r = await fetch(`${API}?action=parse&pageid=${p.pageid}&prop=text|revid&formatversion=2` +
        "&format=json&disableeditsection=1&disablelimitreport=1&disabletoc=1").then((x) => x.json());
      const content = convert(r.parse.text);
      out.push({
        title: p.title.replace(/^Arma Reforger:/, ""),
        source: "bistudio-wiki",
        content,
        url: `https://community.bistudio.com/wiki/${encodeURI(p.title.replace(/ /g, "_"))}`,
        pageId: p.pageid,
        revisionId: r.parse.revid,
        revisionTimestamp: p.revisions?.[0]?.timestamp ?? null,
      });
    } catch (e) {
      state.failed.push(`${p.title}: ${e}`);
    }
    state.done++;
    await new Promise((res) => setTimeout(res, delayMs));
  }

  const capture = {
    schemaVersion: 1,
    source: `${API}`,
    namespace: 5050,
    format: "markdown",
    capturedAt: new Date().toISOString(),
    officialCount: out.length,
    pages: out,
  };
  state.status = "done";
  window.__wikiCaptureResult = capture;
  // A public page may not fetch() a loopback address (Private Network Access),
  // but a top-level form POST navigation to it is allowed. This leaves the tab
  // on the receiver's "saved" page.
  if (endpoint) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = endpoint;
    form.enctype = "application/x-www-form-urlencoded";
    const field = document.createElement("textarea");
    field.name = "data";
    field.value = JSON.stringify(capture);
    form.appendChild(field);
    document.body.appendChild(form);
    form.submit();
  }
  return { pages: out.length, failed: state.failed.length };
}
