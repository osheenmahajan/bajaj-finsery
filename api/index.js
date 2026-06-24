const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Personal Details (UPDATE THESE) ──────────────────────────────────────────
const USER_ID = "osheenmahajan_01122004";       // e.g. "johndoe_17091999"
const EMAIL_ID = "osheen0675.be23@chitkara.edu.in"; // your college email
const ROLL_NUMBER = "2310990675";            // your roll number
// ─────────────────────────────────────────────────────────────────────────────

/** Validate & parse a single entry. Returns { parent, child } or null. */
function parseEntry(raw) {
  const entry = raw.trim();

  // Must contain "->"
  if (!entry.includes("->")) return null;

  const [left, right] = entry.split("->", 2);

  // Exactly one uppercase letter on each side
  const single = /^[A-Z]$/;
  if (!single.test(left) || !single.test(right)) return null;

  // Self-loop is invalid
  if (left === right) return null;

  return { parent: left, child: right };
}

/** Build hierarchies from valid, deduplicated edges. */
function buildHierarchies(edges) {
  // Track children of each node and parents of each node
  const children = {}; // parent -> [children]
  const parentOf = {}; // child -> first parent that claimed it

  for (const { parent, child } of edges) {
    // Diamond / multi-parent: first parent wins
    if (parentOf[child] !== undefined) continue;
    parentOf[child] = parent;

    if (!children[parent]) children[parent] = [];
    children[parent].push(child);
    // Ensure child is registered
    if (!children[child]) children[child] = [];
  }

  // All nodes
  const allNodes = new Set([...Object.keys(children), ...Object.keys(parentOf)]);

  // Roots = nodes that never appear as a child
  const roots = [...allNodes].filter((n) => parentOf[n] === undefined);

  // Find connected components using undirected adjacency
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
    // Root(s) in this component
    const compRoots = [...comp].filter((n) => parentOf[n] === undefined);

    let root;
    if (compRoots.length > 0) {
      root = compRoots.sort()[0]; // lexicographically smallest root
    } else {
      // Pure cycle — no root; use lex-smallest node
      root = [...comp].sort()[0];
    }

    // Detect cycle with DFS
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

// ── POST /bfhl ────────────────────────────────────────────────────────────────
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
      // Only push once to duplicate_edges regardless of repetitions
      if (!duplicateEdges.includes(key)) {
        duplicateEdges.push(key);
      }
    } else {
      seenEdges.add(key);
      validEdges.push(parsed);
    }
  }

  const hierarchies = buildHierarchies(validEdges);

  // Summary
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