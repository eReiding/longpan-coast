export function terrainOBJ(field, center, size = 220, step = 2) {
  const count = Math.floor(size / step) + 1;
  const originX = Math.round((center.x - size / 2) / step) * step;
  const originZ = Math.round((center.z - size / 2) / step) * step;
  const lines = [
    '# Longpan coast / procedural visual reconstruction, not a survey or engineering drawing',
    '# Units: metres; +X east, +Y up, +Z south',
    `# Origin: ${field.config.origin.lat} N, ${field.config.origin.lon} E`,
    '# Public DEM and OpenStreetMap constrain macro topography; local detail is generated',
    'o Longpan_Coral_Terrace',
  ];
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) {
    const x = originX + i * step, z = originZ + j * step;
    lines.push(`v ${x.toFixed(3)} ${field.heightAt(x, z).toFixed(3)} ${z.toFixed(3)}`);
  }
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) {
    const n = field.normalAt(originX + i * step, originZ + j * step);
    lines.push(`vn ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}`);
  }
  for (let j = 0; j < count - 1; j++) for (let i = 0; i < count - 1; i++) {
    const a = j * count + i + 1, b = a + 1, c = a + count, d = c + 1;
    lines.push(`f ${a}//${a} ${c}//${c} ${b}//${b}`, `f ${b}//${b} ${c}//${c} ${d}//${d}`);
  }
  return lines.join('\n') + '\n';
}

export function createCadExporter(field) {
  return function exportOBJ(center, size = 220, step = 2) {
    const count = Math.floor(size / step) + 1;
    const blob = new Blob([terrainOBJ(field, center, size, step)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'longpan-terrain-220m.obj';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { vertices: count * count, triangles: (count - 1) ** 2 * 2 };
  };
}
