#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'pkg-field-gauge', version: pkg.version, configKey: 'pkgFieldGauge', rules: RULES,
  tagline: 'validate package.json fields before you publish',
  usage: 'Usage: pkg-field-gauge [dir] [options]',
  help: `Fields
      --require <fields>    Extra required fields (comma-separated, dotted paths ok: engines.node,funding)
`,
  options: { require: { type: 'string', multiple: true } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { require: splitList(o.require), toolVersion: pkg.version }, config, configFile),
});
