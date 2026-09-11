/** Minimal CBOR encoder for demo mdoc / COSE (ints, bstr, tstr, arrays, maps, tags). */

export function cborTag(tag, value) {
  return { $cborTag: tag, value };
}

function encodeHead(major, n) {
  if (n < 24) return Uint8Array.of((major << 5) | n);
  if (n < 256) return Uint8Array.of((major << 5) | 24, n);
  if (n < 65536) return Uint8Array.of((major << 5) | 25, (n >> 8) & 0xff, n & 0xff);
  return Uint8Array.of(
    (major << 5) | 26,
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  );
}

function partsOf(value) {
  if (value === false) return [Uint8Array.of(0xf4)];
  if (value === true) return [Uint8Array.of(0xf5)];
  if (value === null || value === undefined) return [Uint8Array.of(0xf6)];
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error(`CBOR float not supported: ${value}`);
    if (value >= 0) return [encodeHead(0, value)];
    return [encodeHead(1, -1 - value)];
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return [encodeHead(3, bytes.length), bytes];
  }
  if (value instanceof Uint8Array) return [encodeHead(2, value.length), value];
  if (value && typeof value === 'object' && Number.isInteger(value.$cborTag)) {
    return [encodeHead(6, value.$cborTag), ...partsOf(value.value)];
  }
  if (Array.isArray(value)) {
    const out = [encodeHead(4, value.length)];
    for (const item of value) out.push(...partsOf(item));
    return out;
  }
  if (value instanceof Map) {
    const out = [encodeHead(5, value.size)];
    for (const [k, v] of value) out.push(...partsOf(k), ...partsOf(v));
    return out;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    const out = [encodeHead(5, keys.length)];
    for (const key of keys) out.push(...partsOf(key), ...partsOf(value[key]));
    return out;
  }
  throw new Error(`cannot encode CBOR value ${String(value)}`);
}

export function encodeCbor(value) {
  const parts = partsOf(value);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cborWrap(value) {
  return { $cborWrap: true, value };
}

export function cborEmbedded(value) {
  return { $cborTag: 24, $embedded: true, value };
}

function hexDiag(bytes) {
  const hex = bytesToHex(bytes);
  if (hex.length <= 64) return `h'${hex}'`;
  const chunks = [];
  for (let i = 0; i < hex.length; i += 64) chunks.push(hex.slice(i, i + 64));
  return `h'\n${chunks.join('\n')}\n'`;
}

/** RFC 8949 / ISO 18013-5 CBOR diagnostic notation (`24(<< >>)`, `h'…'`, `0("tdate")`). */
export function toCborDiag(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const inner = indent + 2;
  const padInner = ' '.repeat(inner);

  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Uint8Array) return hexDiag(value);

  if (value && value.$cborWrap) {
    const nested = toCborDiag(value.value, inner);
    if (!nested.includes('\n')) return `<< ${nested} >>`;
    return `<<\n${padInner}${nested}\n${pad}>>`;
  }

  if (value && Number.isInteger(value.$cborTag)) {
    if (value.$cborTag === 0 && typeof value.value === 'string') return `0(${JSON.stringify(value.value)})`;
    if (value.$embedded || (value.$cborTag === 24 && !(value.value instanceof Uint8Array))) {
      const nested = toCborDiag(value.value, inner);
      return `24(<<\n${padInner}${nested}\n${pad}>>)`;
    }
    if (value.$cborTag === 24 && value.value instanceof Uint8Array) return `24(${hexDiag(value.value)})`;
    return `${value.$cborTag}(${toCborDiag(value.value, indent)})`;
  }

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const parts = value.map((item) => toCborDiag(item, inner));
    if (parts.every((part) => !part.includes('\n')) && parts.join(', ').length <= 72) {
      return `[${parts.join(', ')}]`;
    }
    return `[\n${parts.map((part) => `${padInner}${part}`).join(',\n')}\n${pad}]`;
  }

  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value || {});
  if (!entries.length) return '{}';
  const parts = entries.map(([key, item]) => {
    const label = typeof key === 'number' || /^-?\d+$/.test(String(key)) ? String(key) : JSON.stringify(String(key));
    return `${label}: ${toCborDiag(item, inner)}`;
  });
  if (parts.every((part) => !part.includes('\n')) && parts.join(', ').length <= 72) {
    return `{ ${parts.join(', ')} }`;
  }
  return `{\n${parts.map((part) => `${padInner}${part}`).join(',\n')}\n${pad}}`;
}
