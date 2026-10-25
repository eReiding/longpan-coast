export function createObstacleIndex(obstacles, cellSize = 16) {
  const cells = new Map();
  for (const obstacle of obstacles) {
    const key = `${Math.floor(obstacle.x / cellSize)},${Math.floor(obstacle.z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(obstacle);
  }
  return {
    cells,
    nearby(x, z) {
      const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
      const result = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const items = cells.get(`${cx + dx},${cz + dz}`);
        if (items) result.push(...items);
      }
      return result;
    },
  };
}
