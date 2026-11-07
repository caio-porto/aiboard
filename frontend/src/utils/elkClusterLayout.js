import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function computeElkCompoundLayout(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    return { nodes: nodes || [], edges: edges || [] };
  }

  const nextNodes = nodes.map((n) => ({ ...n }));
  const nextEdges = (edges || []).map((e) => ({ ...e }));
  const nodeMap = new Map(nextNodes.map((n) => [n.id, n]));

  const getWidth = (n) => {
    const fallback = n?.type === 'agent' ? 430 : 220;
    return Number(n?.measured?.width || n?.style?.width || n?.width || fallback);
  };

  const getHeight = (n) => {
    const fallback = n?.type === 'agent' ? 225 : n?.type === 'tool' ? 98 : 64;
    return Number(n?.measured?.height || n?.style?.height || n?.height || fallback);
  };

  const ceoNode =
    nextNodes.find((n) => n.id === 'agent-ceo') ||
    nextNodes.find((n) => n.type === 'agent' && (n.data?.isLead || n.data?.department === 'ceo')) ||
    nextNodes.find((n) => n.type === 'agent');

  const getColumnKey = (n) => {
    if (!n) return 'outros';
    if (n.id === ceoNode?.id) return 'ceo';
    const dept = (n.data?.department || '').toLowerCase();
    const id = (n.id || '').toLowerCase();
    if (dept.includes('cfo') || dept.includes('financ') || id.includes('cfo')) return 'cfo';
    if (dept.includes('coo') || dept.includes('opera') || id.includes('coo')) return 'coo';
    if (dept.includes('cmo') || dept.includes('market') || id.includes('cmo')) return 'cmo';
    if (dept.includes('cpo') || dept.includes('gente') || dept.includes('rh') || id.includes('cpo')) return 'cpo';
    return 'outros';
  };

  const leftSatsMap = new Map();
  const rightSatsMap = new Map();
  const topTriggers = [];
  const assignedSats = new Set();

  nextNodes.forEach((n) => {
    if (n.type === 'agent') {
      leftSatsMap.set(n.id, []);
      rightSatsMap.set(n.id, []);
    }
  });

  const sortByY = (arr) => [...arr].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

  sortByY(nextNodes.filter((n) => n.type === 'trigger')).forEach((trig) => {
    const targetAgentId = nextEdges
      .filter((e) => e.source === trig.id || e.target === trig.id)
      .map((e) => (e.source === trig.id ? e.target : e.source))
      .filter((id) => nodeMap.get(id)?.type === 'agent')
      .find((id) => id !== ceoNode?.id);

    if (targetAgentId && leftSatsMap.has(targetAgentId)) {
      leftSatsMap.get(targetAgentId).push(trig);
      assignedSats.add(trig.id);
    } else {
      topTriggers.push(trig);
      assignedSats.add(trig.id);
    }
  });

  sortByY(nextNodes.filter((n) => n.type === 'tool')).forEach((tool) => {
    const linked = nextEdges
      .filter((e) => e.source === tool.id || e.target === tool.id)
      .map((e) => ({
        edge: e,
        agent: nodeMap.get(e.source === tool.id ? e.target : e.source)
      }))
      .filter((item) => item.agent && item.agent.type === 'agent');

    if (linked.length === 0) return;

    linked.sort(
      (a, b) =>
        Math.abs((a.agent.position?.y ?? 0) - (tool.position?.y ?? 0)) -
        Math.abs((b.agent.position?.y ?? 0) - (tool.position?.y ?? 0))
    );

    const best = linked[0];
    const agent = best.agent;
    const edge = best.edge;
    const colKey = getColumnKey(agent);
    const side = (tool.data?.side || '').toLowerCase();
    const isLeft =
      side === 'left'
        ? true
        : side === 'right'
        ? false
        : (edge.targetHandle === 'tools' && edge.sourceHandle === 'tool_out') || colKey === 'cfo';

    if (isLeft) {
      leftSatsMap.get(agent.id).push(tool);
    } else {
      rightSatsMap.get(agent.id).push(tool);
    }
    assignedSats.add(tool.id);
  });

  const colOrder = ['cfo', 'coo', 'cmo', 'cpo', 'outros'];
  const columns = { cfo: [], coo: [], cmo: [], cpo: [], outros: [] };

  nextNodes.forEach((n) => {
    if (n.type === 'agent' && n.id !== ceoNode?.id) {
      const colKey = getColumnKey(n);
      columns[colKey].push(n);
    }
  });

  const topoSortColumn = (colAgents, colKey) => {
    if (colAgents.length <= 1) return colAgents;
    const idSet = new Set(colAgents.map((a) => a.id));
    const inDegree = new Map(colAgents.map((a) => [a.id, 0]));
    const adj = new Map(colAgents.map((a) => [a.id, []]));

    nextEdges.forEach((e) => {
      if (e.targetHandle !== 'collab_in' && idSet.has(e.source) && idSet.has(e.target)) {
        adj.get(e.source).push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      }
    });

    const isLeadInCol = (a) => a.id === `agent-${colKey}` || !!a.data?.isCLevel;
    const queue = colAgents
      .filter((a) => (inDegree.get(a.id) || 0) === 0)
      .sort((a, b) =>
        isLeadInCol(a) === isLeadInCol(b)
          ? (a.position?.y ?? 0) - (b.position?.y ?? 0)
          : isLeadInCol(a)
          ? -1
          : 1
      );

    const result = [];
    const visited = new Set();

    while (queue.length > 0) {
      const curr = queue.shift();
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      result.push(curr);
      (adj.get(curr.id) || [])
        .map((id) => nodeMap.get(id))
        .filter(Boolean)
        .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
        .forEach((child) => {
          inDegree.set(child.id, (inDegree.get(child.id) || 1) - 1);
          if (inDegree.get(child.id) <= 0 && !visited.has(child.id)) {
            queue.push(child);
          }
        });
    }

    colAgents
      .filter((a) => !visited.has(a.id))
      .sort((a, b) =>
        isLeadInCol(a) === isLeadInCol(b)
          ? (a.position?.y ?? 0) - (b.position?.y ?? 0)
          : isLeadInCol(a)
          ? -1
          : 1
      )
      .forEach((a) => result.push(a));

    return result;
  };

  const clusterMeta = new Map();
  nextNodes
    .filter((n) => n.type === 'agent')
    .forEach((agent) => {
      const agentW = getWidth(agent);
      const agentH = getHeight(agent);
      const leftSats = sortByY(leftSatsMap.get(agent.id) || []);
      const rightSats = sortByY(rightSatsMap.get(agent.id) || []);
      const leftStackH =
        leftSats.reduce((sum, s) => sum + getHeight(s), 0) + Math.max(0, leftSats.length - 1) * 25;
      const rightStackH =
        rightSats.reduce((sum, s) => sum + getHeight(s), 0) + Math.max(0, rightSats.length - 1) * 25;
      const maxLeftW = leftSats.reduce((m, s) => Math.max(m, getWidth(s)), 0);
      const maxRightW = rightSats.reduce((m, s) => Math.max(m, getWidth(s)), 0);
      const leftWingW = leftSats.length > 0 ? maxLeftW + 75 : 0;
      const rightWingW = rightSats.length > 0 ? maxRightW + 75 : 0;
      const clusterH = Math.max(agentH, leftStackH, rightStackH);
      const halfExtentY = clusterH / 2;
      const leftExtentFromCenter = agentW / 2 + leftWingW;
      const rightExtentFromCenter = agentW / 2 + rightWingW;

      const meta = {
        agent,
        agentW,
        agentH,
        leftSats,
        rightSats,
        leftStackH,
        rightStackH,
        leftWingW,
        rightWingW,
        clusterW: leftExtentFromCenter + rightExtentFromCenter,
        clusterH,
        halfExtentY,
        leftExtentFromCenter,
        rightExtentFromCenter
      };
      clusterMeta.set(agent.id, meta);
      return meta;
    });

  try {
    const elkChildren = nextNodes
      .filter((n) => n.type === 'agent')
      .map((a) => {
        const meta = clusterMeta.get(a.id);
        return {
          id: a.id,
          width: Math.round(meta.clusterW),
          height: Math.round(meta.clusterH),
          layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
          ports: [
            { id: `${a.id}_north`, properties: { 'port.side': 'NORTH' } },
            { id: `${a.id}_south`, properties: { 'port.side': 'SOUTH' } },
            { id: `${a.id}_west`, properties: { 'port.side': 'WEST' } },
            { id: `${a.id}_east`, properties: { 'port.side': 'EAST' } }
          ]
        };
      });

    const agentIds = new Set(elkChildren.map((c) => c.id));
    const elkEdges = nextEdges
      .filter((e) => agentIds.has(e.source) && agentIds.has(e.target) && e.targetHandle !== 'collab_in')
      .map((e, idx) => ({
        id: e.id || `elk_e_${idx}`,
        sources: [`${e.source}_south`],
        targets: [`${e.target}_north`]
      }));

    await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.spacing.nodeNode': '140',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'
      },
      children: elkChildren,
      edges: elkEdges
    });
  } catch (err) {
    console.warn('ELK validation pass fallback:', err);
  }

  const activeCols = colOrder.filter((k) => columns[k].length > 0);
  const sortedCols = {};
  const colLeftExtents = {};
  const colRightExtents = {};

  activeCols.forEach((k) => {
    const ordered = topoSortColumn(columns[k], k);
    sortedCols[k] = ordered;
    colLeftExtents[k] = ordered.reduce(
      (m, a) => Math.max(m, clusterMeta.get(a.id).leftExtentFromCenter),
      220
    );
    colRightExtents[k] = ordered.reduce(
      (m, a) => Math.max(m, clusterMeta.get(a.id).rightExtentFromCenter),
      220
    );
  });

  const colCenterX = {};
  activeCols.forEach((k, idx) => {
    if (idx === 0) {
      colCenterX[k] = Math.round(133 + colLeftExtents[k]);
    } else {
      const prev = activeCols[idx - 1];
      colCenterX[k] = Math.round(colCenterX[prev] + colRightExtents[prev] + 140 + colLeftExtents[k]);
    }
  });

  const positions = {};
  const placeCluster = (agentId, cx, cy) => {
    const meta = clusterMeta.get(agentId);
    if (!meta) return;
    const ax = Math.round(cx - meta.agentW / 2);
    const ay = Math.round(cy - meta.agentH / 2);
    positions[agentId] = { x: ax, y: ay };

    if (meta.leftSats.length > 0) {
      let sy = cy - meta.leftStackH / 2;
      meta.leftSats.forEach((sat) => {
        const sw = getWidth(sat);
        const sh = getHeight(sat);
        positions[sat.id] = { x: Math.round(ax - 75 - sw), y: Math.round(sy) };
        sy += sh + 25;
      });
    }

    if (meta.rightSats.length > 0) {
      let sy = cy - meta.rightStackH / 2;
      const sx = ax + meta.agentW + 75;
      meta.rightSats.forEach((sat) => {
        const sh = getHeight(sat);
        positions[sat.id] = { x: Math.round(sx), y: Math.round(sy) };
        sy += sh + 25;
      });
    }
  };

  let startY = 460;
  if (ceoNode) {
    const ceoMeta = clusterMeta.get(ceoNode.id);
    let ceoX = 2245;
    if (colCenterX.coo && colCenterX.cmo) {
      ceoX = Math.round((colCenterX.coo + colCenterX.cmo) / 2);
    } else if (activeCols.length > 0) {
      const firstX = colCenterX[activeCols[0]];
      const lastX = colCenterX[activeCols[activeCols.length - 1]];
      ceoX = Math.round((firstX + lastX) / 2);
    }
    const ceoY = 160 + ceoMeta.agentH / 2;
    placeCluster(ceoNode.id, ceoX, ceoY);
    startY = Math.max(460, Math.round(160 + ceoMeta.clusterH + 88));

    if (topTriggers.length > 0) {
      const totalTrigW =
        topTriggers.reduce((sum, t) => sum + getWidth(t), 0) + Math.max(0, topTriggers.length - 1) * 60;
      let tx = ceoX - totalTrigW / 2;
      topTriggers.forEach((t) => {
        const tw = getWidth(t);
        positions[t.id] = { x: Math.round(tx), y: 30 };
        tx += tw + 60;
      });
    }
  }

  activeCols.forEach((k) => {
    const cx = colCenterX[k];
    const ordered = sortedCols[k];
    let prevCy = null;
    let prevHalfH = 0;

    ordered.forEach((agent, idx) => {
      const meta = clusterMeta.get(agent.id);
      let cy;
      if (idx === 0) {
        cy = startY + meta.agentH / 2;
        prevHalfH = Math.max(meta.agentH / 2, meta.halfExtentY);
      } else {
        cy = prevCy + prevHalfH + 80 + meta.halfExtentY;
        prevHalfH = meta.halfExtentY;
      }
      placeCluster(agent.id, cx, cy);
      prevCy = cy;
    });
  });

  const unplaced = nextNodes.filter((n) => !positions[n.id]);
  if (unplaced.length > 0) {
    let uy = startY;
    unplaced.forEach((n) => {
      positions[n.id] = { x: -180, y: Math.round(uy) };
      uy += getHeight(n) + 25;
    });
  }

  const finalNodes = nextNodes.map((n) => {
    const pos = positions[n.id];
    return pos ? { ...n, position: pos } : n;
  });

  const finalNodeMap = new Map(finalNodes.map((n) => [n.id, n]));

  return {
    nodes: finalNodes,
    edges: nextEdges.map((e) => {
      const src = finalNodeMap.get(e.source);
      const tgt = finalNodeMap.get(e.target);
      if (!src || !tgt) return e;
      if ((src.type === 'trigger' || e.source.startsWith('trig')) && tgt.type === 'agent') {
        const srcRight = (src.position?.x ?? 0) + getWidth(src);
        const tgtLeft = tgt.position?.x ?? 0;
        const tgtRight = tgtLeft + getWidth(tgt);
        if (tgt.id !== ceoNode?.id && srcRight <= tgtLeft + 30) {
          return { ...e, sourceHandle: 'trigger_right_out', targetHandle: 'tools' };
        }
        if (tgt.id !== ceoNode?.id && (src.position?.x ?? 0) >= tgtRight - 30) {
          return { ...e, sourceHandle: 'trigger_left_out', targetHandle: 'tools_right' };
        }
        return { ...e, sourceHandle: 'trigger_out', targetHandle: 'input' };
      }
      return e;
    })
  };
}
