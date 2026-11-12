const fs = require('fs');
const path = require('path');
const { FIELDS, SERVICE_DEFS, REQUIRED_GROUPS } = require('./services/schema');
const { atomicWriteJson } = require('./lib/fsAtomic');
const logger = require('./lib/logger');

const CONFIG_DIR = process.env.MARQUEE_CONFIG_DIR || '/config';
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const DEFAULTS_PATH = path.join(__dirname, '..', 'config', 'default-settings.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`could not read ${filePath}: ${err.message}`);
    return null;
  }
}

function getAtPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setAtPath(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// Precedence engine: every schema-declared field (site branding + per-service
// url/key/token) resolves through env var > persisted /config/settings.json >
// shipped default, and remembers which tier it came from so the admin UI can
// mark env-sourced fields "managed by environment" (read-only there).
// Non-schema state (admin password hash, login attempts, branding upload
// paths) lives only in the persisted file — it has no env or default tier,
// see get()/set() below.
class ConfigStore {
  constructor() {
    this.defaults = readJson(DEFAULTS_PATH) || {};
    this.reload();
  }

  reload() {
    this.persisted = readJson(SETTINGS_PATH) || {};
  }

  resolveField(field) {
    const envVal = field.env ? process.env[field.env] : undefined;
    if (envVal !== undefined && envVal !== '') return { value: envVal, source: 'env' };

    const persistedVal = getAtPath(this.persisted, field.path);
    if (persistedVal !== undefined && persistedVal !== '') return { value: persistedVal, source: 'persisted' };

    const defaultVal = getAtPath(this.defaults, field.path);
    return { value: defaultVal !== undefined ? defaultVal : null, source: 'default' };
  }

  // Plain resolved values (no wrapper) — what the rest of the server uses
  // to actually talk to Plex/Seerr/etc or render site branding.
  resolved() {
    const out = {};
    for (const field of FIELDS) setAtPath(out, field.path, this.resolveField(field).value);
    return out;
  }

  // Same tree, but every leaf is { value, source }. Used by the admin API so
  // the settings UI can show lock state and mask secrets.
  resolvedWithSource() {
    const out = {};
    for (const field of FIELDS) setAtPath(out, field.path, this.resolveField(field));
    return out;
  }

  fieldSource(fieldPath) {
    const field = FIELDS.find((f) => f.path === fieldPath);
    return field ? this.resolveField(field).source : 'default';
  }

  // Generic dotted-path accessors for persisted-only state (admin auth, etc).
  get(pathKey, fallback = undefined) {
    const val = getAtPath(this.persisted, pathKey);
    return val !== undefined ? val : fallback;
  }

  async set(pathKey, value) {
    setAtPath(this.persisted, pathKey, value);
    await this.persist();
  }

  async setMany(updates) {
    for (const [pathKey, value] of Object.entries(updates)) setAtPath(this.persisted, pathKey, value);
    await this.persist();
  }

  async persist() {
    await atomicWriteJson(SETTINGS_PATH, this.persisted, 0o600);
  }

  isServiceConfigured(serviceKey) {
    const def = SERVICE_DEFS.find((s) => s.key === serviceKey);
    if (!def) return false;
    const resolved = this.resolved();
    return def.fields.every((f) => {
      const val = resolved.services?.[serviceKey]?.[f];
      return val !== undefined && val !== null && val !== '';
    });
  }

  // Derived, not stored: true once every required service (Seerr) and at
  // least one member of every required group (Plex or Jellyfin) is
  // configured, whether that came from env vars or the admin UI. There is
  // deliberately no separate "setupComplete" flag to keep out of sync with —
  // an env-var-only deployment is "set up" the instant its env vars satisfy
  // this, with no wizard visit required.
  isSetupComplete() {
    const requiredServices = SERVICE_DEFS.filter((s) => s.required).map((s) => s.key);
    if (!requiredServices.every((key) => this.isServiceConfigured(key))) return false;

    for (const groupKeys of Object.values(REQUIRED_GROUPS)) {
      if (!groupKeys.some((key) => this.isServiceConfigured(key))) return false;
    }
    return true;
  }
}

const configStore = new ConfigStore();

module.exports = { configStore, ConfigStore, CONFIG_DIR, SETTINGS_PATH, getAtPath, setAtPath };
