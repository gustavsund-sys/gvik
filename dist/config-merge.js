const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyedArrayFields = new Set(['areas', 'objects3d', 'vegetationSections']);
const keyedObjectFields = new Set(['guides', 'routes', 'axes', 'defaultAxes', 'axisTees', 'par3', 'holeViews', 'flagPositions']);

function mergeKeyed(base, local, remote, field, arrayMode) {
  const toMap = value => arrayMode
    ? Object.fromEntries((Array.isArray(value) ? value : []).filter(item => item?.id).map(item => [item.id, item]))
    : (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  const baseMap = toMap(base), localMap = toMap(local), remoteMap = toMap(remote), result = {}, conflicts = [];
  for (const id of new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(remoteMap)])) {
    const b = baseMap[id], l = localMap[id], r = remoteMap[id];
    if (equal(l, b)) { if (r !== undefined) result[id] = clone(r); }
    else if (equal(r, b) || equal(l, r)) { if (l !== undefined) result[id] = clone(l); }
    else conflicts.push(`${field}:${id}`);
  }
  return { value: arrayMode ? Object.values(result) : result, conflicts };
}

export function mergeCourseConfigs(base = {}, local = {}, remote = {}) {
  const merged = {};
  const conflicts = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.delete('axesRevision');

  for (const key of keys) {
    const baseValue = base[key], localValue = local[key], remoteValue = remote[key];
    if (keyedArrayFields.has(key) || keyedObjectFields.has(key)) {
      const result = mergeKeyed(baseValue, localValue, remoteValue, key, keyedArrayFields.has(key));
      merged[key] = result.value;
      conflicts.push(...result.conflicts);
    } else if (equal(localValue, baseValue)) merged[key] = clone(remoteValue);
    else if (equal(remoteValue, baseValue) || equal(localValue, remoteValue)) merged[key] = clone(localValue);
    else conflicts.push(key);
  }

  if (conflicts.length) return { conflicts, config: null };
  const axesChanged = !equal(merged.axes, remote.axes) || !equal(merged.defaultAxes, remote.defaultAxes) || !equal(merged.axisTees, remote.axisTees) || !equal(merged.par3, remote.par3);
  merged.axesRevision = axesChanged ? Date.now() : Math.max(Number(local.axesRevision) || 0, Number(remote.axesRevision) || 0);
  return { conflicts: [], config: merged };
}
