const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LOCALES = ['en', 'es', 'pt', 'zh', 'id', 'th', 'vi'];
const LOCALES_DIR = path.join(__dirname, '../../src/i18n/locales');

function getKeysHierarchy(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...getKeysHierarchy(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function getLeaves(obj, prefix = '') {
  let leaves = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(leaves, getLeaves(v, fullKey));
    } else {
      leaves[fullKey] = v;
    }
  }
  return leaves;
}

test('i18n Parity — 1. All 7 required locale files exist and are valid JSON', () => {
  for (const loc of LOCALES) {
    const fp = path.join(LOCALES_DIR, `${loc}.json`);
    assert.ok(fs.existsSync(fp), `Locale file for ${loc} must exist at ${fp}`);
    const content = fs.readFileSync(fp, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), `Locale ${loc}.json must be valid JSON`);
  }
});

test('i18n Parity — 2. 100% identical key hierarchy across all 7 languages', () => {
  const enPath = path.join(LOCALES_DIR, 'en.json');
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const enKeys = getKeysHierarchy(enData);

  assert.ok(enKeys.length > 50, `Expected at least 50 translation keys, got ${enKeys.length}`);

  for (const loc of LOCALES) {
    if (loc === 'en') continue;
    const locPath = path.join(LOCALES_DIR, `${loc}.json`);
    const locData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
    const locKeys = getKeysHierarchy(locData);

    const missingInLoc = enKeys.filter(k => !locKeys.includes(k));
    const extraInLoc = locKeys.filter(k => !enKeys.includes(k));

    assert.deepEqual(
      missingInLoc,
      [],
      `Locale ${loc} is missing translation keys: ${missingInLoc.join(', ')}`
    );
    assert.deepEqual(
      extraInLoc,
      [],
      `Locale ${loc} has extraneous keys not in en: ${extraInLoc.join(', ')}`
    );
  }
});

test('i18n Parity — 3. Zero empty strings, null, or undefined values across all 7 languages', () => {
  for (const loc of LOCALES) {
    const locPath = path.join(LOCALES_DIR, `${loc}.json`);
    const locData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
    const leaves = getLeaves(locData);

    for (const [key, val] of Object.entries(leaves)) {
      assert.ok(
        typeof val === 'string' && val.trim().length > 0,
        `Locale ${loc} key "${key}" must be non-empty string, got: ${JSON.stringify(val)}`
      );
    }
  }
});
