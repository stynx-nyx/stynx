'use strict';

// Fixed security bounds: options cannot disable or increase these limits.
const MAX_DEPTH = 128;
const MAX_NODES = 65536;
const refuse = () => {
  throw new RangeError('Brace AST exceeds structural safety limits');
};

exports.MAX_DEPTH = MAX_DEPTH;
exports.MAX_NODES = MAX_NODES;
exports.assertAst = (ast) => {
  const work = [{ node: ast, depth: 0, leaving: false }];
  const path = new Set();
  let count = 0;
  while (work.length) {
    const { node, depth, leaving } = work.pop();
    if (leaving) {
      path.delete(node);
      continue;
    }
    if (
      !node ||
      typeof node !== 'object' ||
      Array.isArray(node) ||
      depth > MAX_DEPTH ||
      ++count > MAX_NODES ||
      path.has(node)
    )
      refuse();
    if (node.value !== undefined && typeof node.value !== 'string') refuse();
    path.add(node);
    work.push({ node, depth, leaving: true });
    const parents = new Set();
    let parent = node.parent;
    while (parent) {
      if (typeof parent !== 'object' || parents.has(parent) || parents.size >= MAX_DEPTH) refuse();
      parents.add(parent);
      parent = parent.parent;
    }
    if (node.nodes !== undefined) {
      if (
        !Array.isArray(node.nodes) ||
        node.nodes.length > MAX_NODES ||
        work.length + node.nodes.length > MAX_NODES * 2
      )
        refuse();
      for (let i = node.nodes.length - 1; i >= 0; i--)
        work.push({ node: node.nodes[i], depth: depth + 1, leaving: false });
    }
  }
};
