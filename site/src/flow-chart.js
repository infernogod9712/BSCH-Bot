const C = { bot: "#1f5fbf", client: "#17553a", staff: "#6a3d9e", term: "#2fd3b0" };
const LINE = { k: "#1a1a1a", yes: "#1f9d4a", no: "#d0342c", loop: "#e3a900" };
const M = 420, R = 760, R2 = 1090, L1 = 140, L2 = 190;
const W = 270, H = 72, DW = 290, DH = 124;

// type: bot | client | staff | term | dec
const N = {
  n1:  [M, 60,   "term",   "<b>1</b> Client opens hire ticket → <code>hire-[client]-[ticketid]</code>"],
  n2:  [M, 170,  "bot",    "<b>2</b> Bot generates ticketId, creates matching case post in <code>hire-bsch-case-logs</code>"],
  n3:  [M, 280,  "bot",    "<b>3</b> Bot posts first embed: intake info + past build history (auto <code>!buildlogs</code>) + Claim button"],
  ref: [R, 280,  "bot",    "Bot asks how they found BSCH (ad / friend / partnership / Disboard / Discadia / other)", 90],
  d4:  [M, 420,  "dec",    "<b>4</b> Builder claims within 24h?"],
  b4:  [R, 430,  "bot",    "Bot pings all Builders"],
  d4b: [R, 570,  "dec",    "Claimed within next 24h (48h total)?"],
  ap:  [R2, 570, "bot",    "Bot sends apology, asks client to try again"],
  t4:  [R2, 680, "term",   "Ticket archived"],
  n5:  [M, 700,  "staff",  "<b>5</b> Builder claims, becomes Lead (bot edits embed to add roster)"],
  n6:  [M, 810,  "staff",  "<b>6</b> Lead asks client for extra info (freeform, no fixed script)"],
  n7:  [M, 920,  "client", "<b>7</b> Client answers"],
  n9:  [R, 930,  "staff",  "<b>9</b> Other Builders self-add via <code>/addtocase</code>; Lead can remove via <code>/removefromcase</code>", 90],
  n8:  [M, 1030, "staff",  "<b>8</b> Builder types <code>!inject [text]</code> in the ticket"],
  n8b: [M, 1150, "bot",    "Bot appends a numbered Extra Info field. <code>!sub 3 [text]</code> rewords it, <code>!sub 3</code> strikes it out. Numbers never shift", 90],
  n10: [M, 1280, "staff",  "<b>10</b> Lead runs <code>/contract</code>"],
  n11: [M, 1400, "bot",    "<b>11</b> Bot sends contract v1.0 with three buttons: Accept (reuse OK), Accept (no reuse), Decline. Text snapshotted to the case", 90],
  d12: [M, 1550, "dec",    "<b>12</b> Which button?"],
  c1:  [R, 1550, "bot",    "Bot presents reason form"],
  c2:  [R, 1660, "client", "Client gives reason"],
  c3:  [R, 1770, "bot",    "Bot logs reason, closes + archives ticket"],
  t12: [R, 1880, "term",   "Ticket archived"],
  n12: [M, 1700, "bot",    "Bot posts “Contract Accepted”, logs timestamp + whether the build may be reused", 90],
  dvc: [M, 1850, "dec",    "Bot asks: want a voice channel?"],
  vc1: [R, 1850, "bot",    "Bot creates <code>hire-vc-[ticketid]</code> right under the ticket"],
  n13: [M, 1990, "staff",  "<b>13</b> Builder runs <code>/admingrant</code>"],
  n14: [M, 2110, "bot",    "Bot tells the client: make a role, give it <b>Administrator</b>, drag it to the <b>very top</b>, hand it to the builders. Lead gets a Finished button", 100],
  n15: [M, 2250, "client", "<b>14</b> Client grants the access"],
  n16: [M, 2360, "staff",  "<b>15</b> Lead presses <b>Finished — we have access</b>"],
  n17: [M, 2470, "bot",    "Bot logs access-granted timestamp, marks build as started"],
  n18: [M, 2580, "staff",  "<b>16</b> Build happens live in client’s server"],
  n19: [M, 2690, "staff",  "<b>17</b> Lead runs <code>/buildfinished</code>"],
  n20: [M, 2800, "bot",    "<b>18</b> Bot asks client: leave a rating / review?"],
  d19: [M, 2940, "dec",    "<b>19</b> Client wants to leave one?"],
  r1:  [R, 2940, "bot",    "Bot presents form (1–10 rating + text review)"],
  r2:  [R, 3050, "client", "Client submits"],
  r3:  [R, 3160, "bot",    "Bot logs it to ticket + case file"],
  n21: [M, 3160, "staff",  "<b>20</b> Builder runs <code>/paperwork</code> (server name, screenshots, showcase yes/no)"],
  show:[R, 3280, "bot",    "Bot posts the photos to the showcase channel, credited to the roster", 90],
  n22: [M, 3280, "bot",    "<b>21</b> Bot pings Lead: worth the template bank?"],
  d22: [M, 3420, "dec",    "<b>22</b> Lead says yes?"],
  d23: [M, 3570, "dec",    "<b>23</b> Did the client allow reuse on the contract?"],
  n23a:[M, 3710, "bot",    "Bot pings a Builder to copy the server"],
  n23b:[M, 3820, "staff",  "Builder runs <code>/copyserver</code> in the client’s server"],
  n24: [M, 3930, "staff",  "<b>24</b> Lead (or the copying Builder) runs <code>/copyphasedone</code>"],
  n25: [M, 4040, "bot",    "<b>25</b> Bot sends final embed: revoke-access reminder, help desk link, donation link, “clear to close?”"],
  d26: [M, 4180, "dec",    "<b>26</b> Client confirms close?"],
  ask: [R, 4180, "bot",    "Bot asks what the client needs"],
  fin: [M, 4320, "bot",    "Bot saves the transcript, deletes the voice channel, locks the ticket and moves it to the archive", 90],
  end: [M, 4450, "term",   "Archived, then deleted after 7 quiet days"],
};

const node = id => {
  const [x, y, t, , hh] = N[id];
  const w = t === "dec" ? DW : W, h = t === "dec" ? DH : (hh || (t === "term" ? 56 : H));
  return { x, y, w, h, top: [x, y - h / 2], bot: [x, y + h / 2], left: [x - w / 2, y], right: [x + w / 2, y] };
};
const a = (id, side) => node(id)[side];

// [points, color, label, dashed, labelAt]
const E = [];
const chain = (...ids) => { for (let i = 0; i < ids.length - 1; i++) E.push([[a(ids[i], "bot"), a(ids[i + 1], "top")], "k"]); };
chain("n1", "n2", "n3", "d4");
E.push([[a("n3", "right"), a("ref", "left")], "k", "first time only", true]);
E.push([[a("d4", "bot"), a("n5", "top")], "yes", "Yes"]);
E.push([[a("d4", "right"), a("b4", "left")], "no", "No"]);
chain("b4", "d4b");
E.push([[a("d4b", "right"), a("ap", "left")], "no", "No"]);
chain("ap", "t4");
E.push([[a("d4b", "bot"), [R, 700], a("n5", "right")], "yes", "Yes"]);
chain("n5", "n6", "n7", "n8", "n8b");
E.push([[a("n8b", "left"), [L1, 1150], [L1, 810], a("n6", "left")], "loop", "loop 6–8 as needed", false, [L1, 980]]);
E.push([[a("n6", "right"), [R, 810], a("n9", "top")], "k", "optional, parallel", true, [R - 75, 810]]);
chain("n8b", "n10", "n11", "d12");
E.push([[a("d12", "right"), a("c1", "left")], "no", "Decline"]);
chain("c1", "c2", "c3", "t12");
E.push([[a("d12", "bot"), a("n12", "top")], "yes", "Either Accept"]);
chain("n12", "dvc");
E.push([[a("dvc", "right"), a("vc1", "left")], "yes", "Yes"]);
E.push([[a("dvc", "bot"), a("n13", "top")], "no", "No"]);
E.push([[a("vc1", "bot"), [R, 1990], a("n13", "right")], "yes"]);
chain("n13", "n14", "n15", "n16", "n17", "n18", "n19", "n20", "d19");
E.push([[a("d19", "right"), a("r1", "left")], "yes", "Yes"]);
chain("r1", "r2", "r3");
E.push([[a("r3", "left"), a("n21", "right")], "k"]);
E.push([[a("d19", "bot"), a("n21", "top")], "no", "No, skip to 20"]);
E.push([[a("n21", "right"), a("show", "left")], "k", "if showcase ticked", true]);
chain("n21", "n22", "d22");
E.push([[a("d22", "bot"), a("d23", "top")], "yes", "Yes"]);
E.push([[a("d22", "left"), [L1, 3420], [L1, 4040], a("n25", "left")], "no", "No, skip to 25", false, [L1, 3520]]);
E.push([[a("d23", "bot"), a("n23a", "top")], "yes", "Yes"]);
E.push([[a("d23", "left"), [L2, 3570], [L2, 4040]], "no", "No, skip to 25", false, [L2 + 8, 3670]]);
chain("n23a", "n23b", "n24", "n25", "d26");
E.push([[a("d26", "right"), a("ask", "left")], "no", "No"]);
E.push([[a("ask", "top"), [R, 4040], a("n25", "right")], "k", "loop back to 25, ticket stays open", false, [R, 4092]]);
E.push([[a("d26", "bot"), a("fin", "top")], "yes", "Yes"]);
chain("fin", "end");

const svg = document.getElementById("chart");
const VW = 1250, VH = 4510;
svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
svg.setAttribute("width", VW);
svg.setAttribute("height", VH);
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };

const defs = el("defs", {});
for (const [k, col] of Object.entries(LINE)) {
  const m = el("marker", { id: "ar-" + k, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: col }, m);
}

const labels = [];
for (const [pts, c, label, dashed, at] of E) {
  el("path", {
    d: "M" + pts.map(p => p.join(" ")).join(" L"),
    fill: "none", stroke: LINE[c], "stroke-width": c === "loop" ? 3 : 2,
    "stroke-dasharray": dashed ? "6 5" : "none",
    "marker-end": pts.length && (pts[pts.length - 1][0] === L2) ? "" : `url(#ar-${c})`,
  });
  if (label) {
    const [p, q] = pts;
    const horizontal = p[1] === q[1];
    const pos = at || [(p[0] + q[0]) / 2, horizontal ? p[1] - 9 : (p[1] + q[1]) / 2 + 4];
    labels.push([pos, label, LINE[c]]);
  }
}

for (const id in N) {
  const n = node(id), t = N[id][2];
  const g = el("g", { class: "node " + t });
  if (t === "dec") {
    el("polygon", { points: `${n.x},${n.top[1]} ${n.right[0]},${n.y} ${n.x},${n.bot[1]} ${n.left[0]},${n.y}`, fill: "#ffffff", stroke: "#1a1a1a", "stroke-width": 2 }, g);
  } else {
    el("rect", { x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: t === "term" ? n.h / 2 : 2, fill: C[t], stroke: t === "term" ? "#139b80" : "none", "stroke-width": 2 }, g);
  }
  const inset = t === "dec" ? 70 : 0;
  const fo = el("foreignObject", { x: n.x - n.w / 2 + inset, y: n.y - n.h / 2, width: n.w - inset * 2, height: n.h }, g);
  const div = document.createElement("div");
  div.style.color = (t === "dec" || t === "term") ? "#101418" : "#ffffff";
  div.innerHTML = N[id][3];
  fo.appendChild(div);
}

for (const [[x, y], text, col] of labels) {
  el("text", { x, y, fill: col, "text-anchor": "middle", class: "lbl" }).textContent = text;
}
