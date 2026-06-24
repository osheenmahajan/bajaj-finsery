const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.options("*", cors());
app.use(express.json());

// ── Personal Details (UPDATE THESE) ──────────────────────────────────────────
const USER_ID = "osheenmahajan_01122004";
const EMAIL_ID = "osheen0675.be23@chitkara.edu.in";
const ROLL_NUMBER = "2310990675";
// ─────────────────────────────────────────────────────────────────────────────

function parseEntry(raw) {
  const entry = raw.trim();
  if (!entry.includes("->")) return null;
  const [left, right] = entry.split("->", 2);
  const single = /^[A-Z]$/;
  if (!single.test(left) || !single.test(right)) return null;
  if (left === right) return null;
  return { parent: left, child: right };
}

function buildHierarchies(edges) {
  const children = {};
  const parentOf = {};

  for (const { parent, child } of edges) {
    if (parentOf[child] !== undefined) continue;
    parentOf[child] = parent;
    if (!children[parent]) children[parent] = [];
    children[parent].push(child);
    if (!children[child]) children[child] = [];
  }

  const allNodes = new Set([...Object.keys(children), ...Object.keys(parentOf)]);

  const adjacency = {};
  for (const node of allNodes) adjacency[node] = new Set();
  for (const { parent, child } of edges) {
    adjacency[parent].add(child);
    adjacency[child].add(parent);
  }

  const visited = new Set();
  const components = [];

  function bfsComponent(start) {
    const comp = new Set();
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      if (comp.has(n)) continue;
      comp.add(n);
      for (const nb of adjacency[n] || []) {
        if (!comp.has(nb)) queue.push(nb);
      }
    }
    return comp;
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      const comp = bfsComponent(node);
      comp.forEach((n) => visited.add(n));
      components.push(comp);
    }
  }

  const hierarchies = [];

  for (const comp of components) {
    const compRoots = [...comp].filter((n) => parentOf[n] === undefined);
    let root;
    if (compRoots.length > 0) {
      root = compRoots.sort()[0];
    } else {
      root = [...comp].sort()[0];
    }

    const hasCycle = detectCycle(root, children, comp);

    if (hasCycle) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
    } else {
      const tree = buildTree(root, children);
      const depth = calcDepth(root, children);
      hierarchies.push({ root, tree, depth });
    }
  }

  return hierarchies;
}

function detectCycle(root, children, compNodes) {
  const visiting = new Set();
  const visited = new Set();

  function dfs(node) {
    visiting.add(node);
    for (const child of children[node] || []) {
      if (!compNodes.has(child)) continue;
      if (visiting.has(child)) return true;
      if (!visited.has(child) && dfs(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return dfs(root);
}

function buildTree(root, children) {
  const result = {};
  result[root] = {};
  for (const child of children[root] || []) {
    Object.assign(result[root], buildTree(child, children));
  }
  return result;
}

function calcDepth(root, children) {
  let max = 0;
  for (const child of children[root] || []) {
    max = Math.max(max, calcDepth(child, children));
  }
  return 1 + max;
}

app.post("/bfhl", (req, res) => {
  const data = req.body?.data;

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "Request body must have a 'data' array." });
  }

  const invalidEntries = [];
  const duplicateEdges = [];
  const validEdges = [];
  const seenEdges = new Set();

  for (const raw of data) {
    if (typeof raw !== "string") {
      invalidEntries.push(String(raw));
      continue;
    }

    const parsed = parseEntry(raw);
    if (!parsed) {
      invalidEntries.push(raw.trim() || raw);
      continue;
    }

    const key = `${parsed.parent}->${parsed.child}`;

    if (seenEdges.has(key)) {
      if (!duplicateEdges.includes(key)) {
        duplicateEdges.push(key);
      }
    } else {
      seenEdges.add(key);
      validEdges.push(parsed);
    }
  }

  const hierarchies = buildHierarchies(validEdges);

  const nonCyclic = hierarchies.filter((h) => !h.has_cycle);
  const cyclic = hierarchies.filter((h) => h.has_cycle);

  let largestTreeRoot = "";
  if (nonCyclic.length > 0) {
    const sorted = [...nonCyclic].sort((a, b) => {
      if (b.depth !== a.depth) return b.depth - a.depth;
      return a.root < b.root ? -1 : 1;
    });
    largestTreeRoot = sorted[0].root;
  }

  return res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: ROLL_NUMBER,
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary: {
      total_trees: nonCyclic.length,
      total_cycles: cyclic.length,
      largest_tree_root: largestTreeRoot,
    },
  });
});

app.get("/", (req, res) => res.json({ status: "ok", route: "POST /bfhl" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));