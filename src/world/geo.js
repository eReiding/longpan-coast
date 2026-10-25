export function project(lon, lat, origin) {
  return {
    x: (lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180),
    z: -(lat - origin.lat) * 110940,
  };
}

export function projectWay(way, origin) {
  return { id: way.id, tags: way.tags, points: way.points.map(point => project(point.lon, point.lat, origin)) };
}

export function nearestOnPath(points, x, z) {
  let best = { distance: Infinity, x: points[0].x, z: points[0].z, dx: 1, dz: 0, index: 0, t: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) best = { distance, x: px, z: pz, dx, dz, index: i, t };
  }
  return best;
}

export function nearestOnPaths(paths, x, z) {
  let best = null;
  for (const path of paths) {
    const point = nearestOnPath(path.points, x, z);
    if (!best || point.distance < best.distance) best = { ...point, id: path.id };
  }
  return best;
}

export function pointAlongPath(points, fraction) {
  let total = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    lengths.push(length); total += length;
  }
  let distance = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const a = points[i], b = points[i + 1];
      const t = lengths[i] ? distance / lengths[i] : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / (lengths[i] || 1), dz: (b.z - a.z) / (lengths[i] || 1) };
    }
    distance -= lengths[i];
  }
  return { ...points.at(-1), dx: 1, dz: 0 };
}

export function makeCoastSampler(points) {
  const sorted = [...points].sort((a, b) => a.z - b.z);
  return z => {
    if (z <= sorted[0].z) return sorted[0].x;
    if (z >= sorted.at(-1).z) return sorted.at(-1).x;
    let low = 0, high = sorted.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (sorted[mid].z > z) high = mid; else low = mid;
    }
    const a = sorted[low], b = sorted[high];
    const t = (z - a.z) / (b.z - a.z || 1);
    return a.x + (b.x - a.x) * t;
  };
}
