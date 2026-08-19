/**
 * The `de` locale is the source of truth. `en` must carry the same key set, so
 * a missing translation shows up here and not as a raw key in the UI.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) =>
    child !== null && typeof child === 'object'
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function load(name) {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../src/i18n/${name}.json`, import.meta.url)), 'utf8'),
  )
}

const de = new Set(keys(load('de')))
const en = new Set(keys(load('en')))
const missingInEn = [...de].filter((key) => !en.has(key))
const extraInEn = [...en].filter((key) => !de.has(key))

if (missingInEn.length > 0 || extraInEn.length > 0) {
  console.error('i18n key sets differ.')
  if (missingInEn.length > 0) console.error('  missing in en:', missingInEn.join(', '))
  if (extraInEn.length > 0) console.error('  not in de:', extraInEn.join(', '))
  process.exit(1)
}
console.log(`i18n ok: ${de.size} keys in de and en`)
