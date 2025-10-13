export function buildStationGraph(lines = []) {
  const graph = new Map();

  lines.forEach((line) => {
    const stations = line?.stations || [];
    for (let index = 0; index < stations.length - 1; index += 1) {
      const currentId = stations[index]?.stop_id;
      const nextId = stations[index + 1]?.stop_id;
      if (!currentId || !nextId) {
        continue;
      }
      if (!graph.has(currentId)) {
        graph.set(currentId, new Set());
      }
      if (!graph.has(nextId)) {
        graph.set(nextId, new Set());
      }
      graph.get(currentId).add(nextId);
      graph.get(nextId).add(currentId);
    }
  });

  return graph;
}

export function findShortestPath(graph, start, destination) {
  if (!start || !destination) {
    return [];
  }
  if (start === destination) {
    return [start];
  }
  if (!graph.has(start) || !graph.has(destination)) {
    return [];
  }

  const queue = [[start]];
  const visited = new Set([start]);

  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current === destination) {
      return path;
    }

    const neighbours = graph.get(current) || [];
    neighbours.forEach((next) => {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    });
  }

  return [];
}
