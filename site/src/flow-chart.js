// flow-chart.js
// Draws the hire flow. Every label is measured in the page first, then the
// boxes are sized and stacked around the measured text, so nothing ever
// overflows a box or collides with the next one.
//
// Node kinds: bot | client | staff | term | dec
// Columns:    main (spine), r1 (first branch), r2 (second branch)
// Position:   anchor -> sits level with that node; after -> sits below that one.

const COL = { main: 470, r1: 880, r2: 1240 };
const W = { main: 300, r1: 290, r2: 260, dec: 330 };
const GAP = 52;
const LANE = { a: 150, b: 200 };          // left-hand skip lanes

const FILL = {
  bot: "#1f57d6",
  client: "#17806a",
  staff: "#6d43c8",
  term: "#0f8f77",
  dec: "#0d1c3d",
};
const LINE = { plain: "#b9cdf2", yes: "#4ade80", no: "#f87171", loop: "#fbbf24" };

const N = [
  { id: "t1",   kind: "term",   col: "main", text: "Client opens a hire ticket, named <code>hire-[client]-[id]</code>" },
  { id: "n2",   kind: "bot",    col: "main", step: 2, text: "Generates the ticket id and opens the matching case file in <b>hire-bsch-case-logs</b>" },
  { id: "n3",   kind: "bot",    col: "main", step: 3, text: "Posts the intake embed: what the client asked for, their past builds, and a <b>Claim</b> button" },
  { id: "ref",  kind: "bot",    col: "r1", anchor: "n3", text: "Asks how they found BSCH. Once per person, ever" },
  { id: "d4",   kind: "dec",    col: "main", step: 4, text: "Claimed within 24 hours?" },
  { id: "b4",   kind: "bot",    col: "r1", anchor: "d4", text: "Pings every Builder" },
  { id: "d4b",  kind: "dec",    col: "r1", after: "b4", text: "Claimed in the next 24 hours?" },
  { id: "ap",   kind: "bot",    col: "r2", anchor: "d4b", text: "Apologises and asks the client to try again later" },
  { id: "t4",   kind: "term",   col: "r2", after: "ap", text: "Ticket archived" },
  { id: "n5",   kind: "staff",  col: "main", step: 5, text: "A Builder claims it and becomes <b>Lead</b>. The roster appears on the case" },
  { id: "n6",   kind: "staff",  col: "main", step: 6, text: "Lead asks the client whatever the build needs. No script" },
  { id: "n7",   kind: "client", col: "main", step: 7, text: "Client answers" },
  { id: "n9",   kind: "staff",  col: "r1", anchor: "n7", text: "Any other Builder can join with <code>/addtocase</code>, and the Lead can remove one with <code>/removefromcase</code>" },
  { id: "n8",   kind: "staff",  col: "main", step: 8, text: "Builder records it with <code>!inject [text]</code>" },
  { id: "n8b",  kind: "bot",    col: "main", text: "Files it as numbered Extra Info. <code>!sub 3 [text]</code> rewords entry 3, <code>!sub 3</code> strikes it out. Numbers never move" },
  { id: "n10",  kind: "staff",  col: "main", step: 10, text: "Lead runs <code>/contract</code>" },
  { id: "n11",  kind: "bot",    col: "main", step: 11, text: "Sends contract v1.0 and snapshots it onto the case, with three buttons" },
  { id: "d12",  kind: "dec",    col: "main", step: 12, text: "Which button does the client press?" },
  { id: "c1",   kind: "bot",    col: "r1", anchor: "d12", text: "Asks why, in a short form" },
  { id: "c2",   kind: "client", col: "r1", after: "c1", text: "Client gives a reason" },
  { id: "c3",   kind: "bot",    col: "r1", after: "c2", text: "Logs the reason, closes the case" },
  { id: "t12",  kind: "term",   col: "r1", after: "c3", text: "Ticket archived" },
  { id: "n12",  kind: "bot",    col: "main", text: "Posts <b>Contract Accepted</b> and records whether the build may be reused later" },
  { id: "dvc",  kind: "dec",    col: "main", text: "Want a voice channel for the build?" },
  { id: "vc1",  kind: "bot",    col: "r1", anchor: "dvc", text: "Creates <code>hire-vc-[id]</code> directly under the ticket" },
  { id: "n13",  kind: "staff",  col: "main", step: 13, text: "Builder runs <code>/admingrant</code>" },
  { id: "n14",  kind: "bot",    col: "main", text: "Tells the client: make a role, give it <b>Administrator</b>, drag it to the <b>very top</b>, hand it to the builders" },
  { id: "n15",  kind: "client", col: "main", step: 14, text: "Client grants the access" },
  { id: "n16",  kind: "staff",  col: "main", step: 15, text: "Lead presses <b>Finished, we have access</b>" },
  { id: "n17",  kind: "bot",    col: "main", text: "Logs the timestamp and marks the build started" },
  { id: "n18",  kind: "staff",  col: "main", step: 16, text: "Build happens live in the client's server" },
  { id: "n19",  kind: "staff",  col: "main", step: 17, text: "Lead runs <code>/buildfinished</code>" },
  { id: "n20",  kind: "bot",    col: "main", step: 18, text: "Asks the client for a rating and review" },
  { id: "d19",  kind: "dec",    col: "main", step: 19, text: "Does the client want to leave one?" },
  { id: "r1n",  kind: "bot",    col: "r1", anchor: "d19", text: "Opens the rating form, 1 to 10 plus a review" },
  { id: "r2n",  kind: "client", col: "r1", after: "r1n", text: "Client submits it" },
  { id: "r3n",  kind: "bot",    col: "r1", after: "r2n", text: "Logs it to the ticket and the case file" },
  { id: "n21",  kind: "staff",  col: "main", step: 20, text: "Builder files <code>/paperwork</code>: server name, screenshots, and whether to showcase them" },
  { id: "show", kind: "bot",    col: "r1", anchor: "n21", text: "Posts the photos in the showcase channel, credited to the roster" },
  { id: "n22",  kind: "bot",    col: "main", step: 21, text: "Asks the Lead whether this build is worth keeping" },
  { id: "d22",  kind: "dec",    col: "main", step: 22, text: "Lead says yes?" },
  { id: "d23",  kind: "dec",    col: "main", step: 23, text: "Did the client allow reuse on the contract?" },
  { id: "n23a", kind: "bot",    col: "main", text: "Asks a Builder to copy the server" },
  { id: "n23b", kind: "staff",  col: "main", text: "Builder runs <code>/copyserver</code> inside the client's server" },
  { id: "n24",  kind: "staff",  col: "main", step: 24, text: "Lead runs <code>/copyphasedone</code>" },
  { id: "n25",  kind: "bot",    col: "main", step: 25, text: "Sends the closing embed: revoke our access, help desk, donation link, clear to close?" },
  { id: "d26",  kind: "dec",    col: "main", step: 26, text: "Client confirms close?" },
  { id: "ask",  kind: "bot",    col: "r1", anchor: "d26", text: "Asks what the client still needs. Ticket stays open" },
  { id: "fin",  kind: "bot",    col: "main", text: "Saves the transcript, deletes the voice channel, locks the ticket and files it in the archive" },
  { id: "end",  kind: "term",   col: "main", text: "Archived, then deleted after 7 quiet days" },
];

const byId = Object.fromEntries(N.map(n => [n.id, n]));

// Wait for the web fonts before measuring: measuring against a fallback font
// gives boxes that are too short, and the text spills out once Barlow loads.
(async () => {
if (document.fonts && document.fonts.ready) await document.fonts.ready;

// ---- measure every label before deciding how big anything is ----
const ruler = document.createElement("div");
ruler.className = "measure";
document.body.appendChild(ruler);

for (const n of N) {
  n.w = n.kind === "dec" ? W.dec : W[n.col];
  const inner = n.kind === "dec" ? n.w * 0.52 : n.w - 44;
  ruler.style.width = inner + "px";
  ruler.innerHTML = "<span>" + n.text + "</span>";
  const textHeight = ruler.offsetHeight;
  n.h = n.kind === "dec"
    ? Math.max(126, textHeight + 76)
    : Math.max(n.kind === "term" ? 60 : 70, textHeight + 34);
}
ruler.remove();

// ---- stack them ----
let y = 40;
for (const n of N) {
  if (n.col === "main") {
    n.y = y + n.h / 2;
    y = n.y + n.h / 2 + GAP;
  }
}
for (const n of N) {
  if (n.col === "main") continue;
  if (n.anchor) n.y = byId[n.anchor].y;
  else {
    const prev = byId[n.after];
    n.y = prev.y + prev.h / 2 + GAP + n.h / 2;
  }
}
for (const n of N) n.x = COL[n.col];

const top = n => [n.x, n.y - n.h / 2];
const bot = n => [n.x, n.y + n.h / 2];
const left = n => [n.x - n.w / 2, n.y];
const right = n => [n.x + n.w / 2, n.y];
const P = id => byId[id];

// ---- edges: [points, colour, label, dashed, labelAt] ----
const E = [];
const flow = (...ids) => {
  for (let i = 0; i < ids.length - 1; i++) E.push([[bot(P(ids[i])), top(P(ids[i + 1]))], "plain"]);
};

flow("t1", "n2", "n3", "d4");
E.push([[right(P("n3")), left(P("ref"))], "plain", "first time only", true]);
E.push([[bot(P("d4")), top(P("n5"))], "yes", "Yes"]);
E.push([[right(P("d4")), left(P("b4"))], "no", "No"]);
flow("b4", "d4b");
E.push([[right(P("d4b")), left(P("ap"))], "no", "No"]);
flow("ap", "t4");
E.push([[bot(P("d4b")), [P("d4b").x, P("n5").y], right(P("n5"))], "yes", "Yes"]);
flow("n5", "n6", "n7", "n8", "n8b");
E.push([[left(P("n8b")), [LANE.a, P("n8b").y], [LANE.a, P("n6").y], left(P("n6"))], "loop", "loop as needed", false,
        [LANE.a, (P("n6").y + P("n8b").y) / 2]]);
E.push([[right(P("n7")), left(P("n9"))], "plain", "any time", true]);
flow("n8b", "n10", "n11", "d12");
E.push([[right(P("d12")), left(P("c1"))], "no", "Decline"]);
flow("c1", "c2", "c3", "t12");
E.push([[bot(P("d12")), top(P("n12"))], "yes", "Either Accept"]);
flow("n12", "dvc");
E.push([[right(P("dvc")), left(P("vc1"))], "yes", "Yes"]);
E.push([[bot(P("dvc")), top(P("n13"))], "no", "No"]);
E.push([[bot(P("vc1")), [P("vc1").x, P("n13").y], right(P("n13"))], "yes"]);
flow("n13", "n14", "n15", "n16", "n17", "n18", "n19", "n20", "d19");
E.push([[right(P("d19")), left(P("r1n"))], "yes", "Yes"]);
flow("r1n", "r2n", "r3n");
E.push([[bot(P("r3n")), [P("r3n").x, P("n21").y], right(P("n21"))], "plain"]);
E.push([[bot(P("d19")), top(P("n21"))], "no", "No"]);
E.push([[right(P("n21")), left(P("show"))], "plain", "if showcased", true]);
flow("n21", "n22", "d22");
E.push([[bot(P("d22")), top(P("d23"))], "yes", "Yes"]);
E.push([[left(P("d22")), [LANE.a, P("d22").y], [LANE.a, P("n25").y], left(P("n25"))], "no", "No", false, [LANE.a, P("d22").y + 70]]);
E.push([[bot(P("d23")), top(P("n23a"))], "yes", "Yes"]);
E.push([[left(P("d23")), [LANE.b, P("d23").y], [LANE.b, P("n25").y]], "no", "No", false, [LANE.b + 6, P("d23").y + 70]]);
flow("n23a", "n23b", "n24", "n25", "d26");
E.push([[right(P("d26")), left(P("ask"))], "no", "No"]);
E.push([[bot(P("ask")), [P("ask").x, P("n25").y], right(P("n25"))], "plain", "ticket stays open"]);
E.push([[bot(P("d26")), top(P("fin"))], "yes", "Yes"]);
flow("fin", "end");

// ---- draw ----
const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("chart");
const el = (tag, attrs, parent = svg) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
};

const last = N[N.length - 1];
const VW = COL.r2 + W.r2 / 2 + 60;
const VH = last.y + last.h / 2 + 60;
svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
svg.setAttribute("width", VW);
svg.setAttribute("height", VH);

const defs = el("defs", {});
for (const [key, colour] of Object.entries(LINE)) {
  const m = el("marker", {
    id: "tip-" + key, viewBox: "0 0 10 10", refX: 8.5, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse",
  }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: colour }, m);
}

// blueprint grid behind everything
const grid = el("pattern", { id: "grid", width: 40, height: 40, patternUnits: "userSpaceOnUse" }, defs);
el("path", { d: "M40 0 H0 V40", fill: "none", stroke: "rgba(185,205,242,.10)", "stroke-width": 1 }, grid);
el("rect", { x: 0, y: 0, width: VW, height: VH, fill: "url(#grid)" });

const labels = [];
for (const [points, colour, label, dashed, at] of E) {
  const openEnd = points[points.length - 1][0] === LANE.b;   // merges into another line
  el("path", {
    d: "M" + points.map(p => p.join(" ")).join(" L"),
    fill: "none",
    stroke: LINE[colour],
    "stroke-width": colour === "loop" ? 2.5 : 2,
    "stroke-linejoin": "round",
    "stroke-dasharray": dashed ? "7 5" : "none",
    "marker-end": openEnd ? "" : `url(#tip-${colour})`,
  });
  if (!label) continue;
  const [p, q] = points;
  const horizontal = p[1] === q[1];
  labels.push([at || [(p[0] + q[0]) / 2, horizontal ? p[1] - 10 : (p[1] + q[1]) / 2 + 4], label, LINE[colour]]);
}

for (const n of N) {
  const g = el("g", { class: "node " + n.kind });
  if (n.kind === "dec") {
    el("polygon", {
      points: `${n.x},${n.y - n.h / 2} ${n.x + n.w / 2},${n.y} ${n.x},${n.y + n.h / 2} ${n.x - n.w / 2},${n.y}`,
      fill: FILL.dec, stroke: "#b9cdf2", "stroke-width": 2,
    }, g);
  } else {
    el("rect", {
      x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h,
      rx: n.kind === "term" ? n.h / 2 : 3,
      fill: FILL[n.kind],
      stroke: n.kind === "term" ? "#7ff0d5" : "rgba(255,255,255,.22)",
      "stroke-width": n.kind === "term" ? 2 : 1,
    }, g);
  }

  const inset = n.kind === "dec" ? n.w * 0.24 : 22;
  const fo = el("foreignObject", {
    x: n.x - n.w / 2 + inset, y: n.y - n.h / 2 + 10,
    width: n.w - inset * 2, height: n.h - 20,
  }, g);
  const div = document.createElement("div");
  div.className = "label";
  div.innerHTML = "<span>" + n.text + "</span>";
  fo.appendChild(div);

  if (n.step) {
    el("text", {
      x: n.x - n.w / 2 + 9, y: n.y - n.h / 2 + 19,
      class: "step", fill: n.kind === "dec" ? "#b9cdf2" : "rgba(255,255,255,.62)",
    }, g).textContent = n.step;
  }
}

for (const [[x, y], text, colour] of labels) {
  const g = el("g", {});
  const label = el("text", { x, y, fill: colour, "text-anchor": "middle", class: "edge-label" }, g);
  label.textContent = text;
  const box = label.getBBox();
  const chip = el("rect", {
    x: box.x - 8, y: box.y - 4, width: box.width + 16, height: box.height + 8,
    rx: 4, fill: "#0b1b3e", stroke: colour, "stroke-width": 1, "stroke-opacity": .5,
  }, g);
  g.insertBefore(chip, label);
}
})();
