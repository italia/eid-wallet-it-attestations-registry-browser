/** Smartcard view-model from OpenID4VCI credential_configuration display + demo claims. */

import { configurationIdsFor } from '../offer/offer.js';
import { issuerIdOf } from '../issuers/entity-id.js';
import { openidCredentialIssuerMetadata, resolveDumpedIssuerId } from '../artifacts/artifacts.js';

const TECHNICAL = new Set([
  'iss',
  'sub',
  'iat',
  'exp',
  'nbf',
  'vct',
  'vct#integrity',
  'cnf',
  'status',
  '_sd',
  '_sd_alg',
  'kid',
  'kty',
  'crv',
  'x',
  'y',
  'idx',
  'jwk',
  'verification',
  'trust_framework',
  'assurance_level',
]);

const IDENTITY = new Set(['given_name', 'family_name', 'portrait', 'picture']);

export function pickLocalizedDisplay(entries, lang = 'it') {
  if (!Array.isArray(entries) || !entries.length) return null;
  const want = lang === 'en' ? 'en' : 'it';
  return (
    entries.find((entry) => String(entry?.locale || '').toLowerCase().startsWith(want)) || entries[0] || null
  );
}

export function isCssColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim());
}

function parseHexColor(value) {
  const raw = String(value || '').trim();
  if (!isCssColor(raw)) return null;
  let hex = raw.slice(1);
  if (hex.length === 3) hex = hex.split('').map((ch) => `${ch}${ch}`).join('');
  const n = Number.parseInt(hex.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function contrastText(background) {
  const rgb = parseHexColor(background);
  if (!rgb) return '#ffffff';
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  return L > 0.45 ? '#17324d' : '#ffffff';
}

function safeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return '';
  if (/todo/i.test(text)) return '';
  return text;
}

function pathKey(path) {
  return (path || []).map((part) => (part == null ? '*' : String(part))).join('.');
}

function leafName(path) {
  const parts = (path || []).filter((part) => part != null && part !== '');
  return parts.length ? String(parts[parts.length - 1]) : '';
}

function isTechnicalPath(path) {
  const parts = path || [];
  if (!parts.length) return true;
  if (parts[parts.length - 1] == null) return true;
  return parts.some((part) => part != null && TECHNICAL.has(String(part)));
}

function getByPath(value, path) {
  let current = value;
  for (const key of path || []) {
    if (current == null) return undefined;
    if (key == null) {
      current = Array.isArray(current) ? current[0] : current;
      continue;
    }
    if (Array.isArray(current)) current = current[0];
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function mdocValue(decoded, path) {
  const ns = path?.[0];
  const id = path?.[1];
  if (!ns || id == null) return undefined;
  const items = decoded?.documents?.[0]?.issuerSigned?.nameSpaces?.[ns];
  if (!Array.isArray(items)) return undefined;
  const hit = items.find((el) => el.elementIdentifier === id);
  if (!hit) return undefined;
  if (path.length <= 2) return hit.elementValue;
  return getByPath(hit.elementValue, path.slice(2));
}

function claimValue(item, path) {
  if (item?.format === 'mso_mdoc') {
    const nested = mdocValue(item.decoded, path);
    if (nested !== undefined) return nested;
    const leaf = leafName(path);
    if (leaf && item.claims && Object.prototype.hasOwnProperty.call(item.claims, leaf)) return item.claims[leaf];
    return undefined;
  }
  const bag = item?.reconstructed || item?.artifact?.excerpt?.claims || {};
  const fromPath = getByPath(bag, path);
  if (fromPath !== undefined) return fromPath;
  const leaf = leafName(path);
  if (leaf && Object.prototype.hasOwnProperty.call(bag, leaf)) return bag[leaf];
  return undefined;
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  if (Array.isArray(value) && !value.length) return true;
  return false;
}

function looksLikeImage(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:image/')) return true;
  const hex = value.replace(/\s/g, '').toLowerCase();
  return hex.startsWith('89504e47') || hex.startsWith('ffd8ff');
}

function isTinyDemoImage(value) {
  if (typeof value !== 'string') return true;
  if (value.startsWith('data:image/') && value.length < 200) return true;
  const hex = value.replace(/\s/g, '');
  return hex.startsWith('89504e47') && hex.length < 200;
}

function imageSrc(value) {
  if (typeof value !== 'string' || isTinyDemoImage(value)) return '';
  if (value.startsWith('data:image/')) return value;
  const hex = value.replace(/\s/g, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
    const mime = hex.toLowerCase().startsWith('ffd8ff') ? 'image/jpeg' : 'image/png';
    const bytes = hex.match(/.{2}/g).map((b) => Number.parseInt(b, 16));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return `data:${mime};base64,${btoa(bin)}`;
  }
  return '';
}

function formatClaimValue(value) {
  if (typeof value === 'boolean') return value ? true : false;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.tdate === 'string') {
    return value.tdate.slice(0, 10);
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== 'object')) return value.map((item) => String(item)).join(', ');
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function credentialClaims(config) {
  const meta = config?.credential_metadata?.claims;
  if (Array.isArray(meta)) return meta;
  const legacy = config?.claims || config?.credential_definition?.claims;
  if (Array.isArray(legacy)) return legacy;
  if (legacy && typeof legacy === 'object') {
    return Object.entries(legacy).map(([name, spec]) => ({
      path: [name],
      display: spec?.display,
    }));
  }
  return [];
}

function catalogIssuers(dump, credentialType) {
  const cred = (dump?.catalog?.credentials || []).find((row) => row.credential_type === credentialType);
  return cred?.issuers || [];
}

export function issuerConfigurationForFormat(dump, credentialType, format) {
  const formats = format ? [format] : [];
  for (const issuer of catalogIssuers(dump, credentialType)) {
    const iid = resolveDumpedIssuerId(dump, issuerIdOf(issuer), { credentialType, formats });
    if (!iid) continue;
    const metadata =
      dump?.issuerMetadata?.[iid] ||
      openidCredentialIssuerMetadata(dump?.issuerFederation?.[iid]);
    if (!metadata) continue;
    const ids = configurationIdsFor(credentialType, formats, metadata);
    for (const id of ids.ids) {
      const config = metadata.credential_configurations_supported?.[id];
      if (config) return { issuerId: iid, metadata, configurationId: id, config, derived: ids.derived };
    }
  }
  return null;
}

function fallbackClaimsFromItem(item) {
  const bag =
    item?.format === 'mso_mdoc'
      ? item.claims || {}
      : item?.reconstructed || item?.artifact?.excerpt?.claims || {};
  return Object.keys(bag)
    .filter((key) => !TECHNICAL.has(key))
    .map((key) => ({ path: [key], display: [] }));
}

export function demoCardModel(item, { dump, node, lang = 'it' } = {}) {
  if (!item || !node) return null;
  const picked = issuerConfigurationForFormat(dump, node.credential_type, item.format);
  const config = picked?.config || null;
  const display = pickLocalizedDisplay(config?.credential_metadata?.display || config?.display, lang);
  const issuerDisplay = pickLocalizedDisplay(picked?.metadata?.display, lang);
  const logo = display?.logo || issuerDisplay?.logo || null;
  const backgroundColor = isCssColor(display?.background_color) ? display.background_color.trim() : '';
  const textColor = isCssColor(display?.text_color)
    ? display.text_color.trim()
    : backgroundColor
      ? contrastText(backgroundColor)
      : '';
  const backgroundImage = safeHttpUrl(display?.background_image?.uri || display?.background_image);
  const metaClaims = credentialClaims(config);
  const sources = metaClaims.length ? metaClaims : fallbackClaimsFromItem(item);
  const keys = sources.map((row) => pathKey(row.path));
  const rows = [];
  const usedIdentity = {};
  for (const spec of sources) {
    const path = spec.path || [];
    if (isTechnicalPath(path)) continue;
    const key = pathKey(path);
    if (keys.some((other) => other !== key && other.startsWith(`${key}.`))) continue;
    const value = claimValue(item, path);
    if (isEmptyValue(value)) continue;
    const leaf = leafName(path);
    const localized = pickLocalizedDisplay(spec.display, lang);
    const label = localized?.name || leaf;
    if (IDENTITY.has(leaf) && usedIdentity[leaf] == null) usedIdentity[leaf] = value;
    if (IDENTITY.has(leaf)) continue;
    rows.push({
      path: pathKey(path),
      id: leaf,
      label,
      description: localized?.description || '',
      value: looksLikeImage(value) ? '' : formatClaimValue(value),
      boolean: typeof value === 'boolean',
      booleanValue: typeof value === 'boolean' ? value : null,
    });
  }
  const givenName = usedIdentity.given_name;
  const familyName = usedIdentity.family_name;
  const photoValue = usedIdentity.portrait || usedIdentity.picture;
  const initials = `${String(givenName || '').charAt(0)}${String(familyName || '').charAt(0)}`.toUpperCase() || 'ID';
  return {
    configurationId: picked?.configurationId || '',
    format: item.format || '',
    name: display?.name || node.label || node.credential_type,
    description: display?.description || '',
    issuerName: issuerDisplay?.name || '',
    logoUri: safeHttpUrl(logo?.uri),
    logoAlt: logo?.alt_text || issuerDisplay?.name || '',
    backgroundColor,
    textColor,
    backgroundImage,
    mutedColor: textColor === '#17324d' ? 'rgba(23, 50, 77, 0.72)' : 'rgba(255, 255, 255, 0.78)',
    themedFromMetadata: Boolean(backgroundColor || textColor || backgroundImage),
    givenName: givenName == null ? '' : String(givenName),
    familyName: familyName == null ? '' : String(familyName),
    initials,
    photoSrc: imageSrc(photoValue),
    claims: rows.filter((row) => row.value !== '' || row.boolean),
  };
}

export function demoCardModels(items, ctx) {
  return (items || []).map((item) => demoCardModel(item, ctx)).filter(Boolean);
}
