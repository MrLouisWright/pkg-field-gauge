import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const BIN = fileURLToPath(new URL('../bin/pkg-field-gauge.js', import.meta.url));
export const FX = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
export const tmp = () => mkdtempSync(join(tmpdir(), 'pf-'));
export function proj(pkg, files = {}) { const d = tmp(); const all = { 'package.json': typeof pkg === 'string' ? pkg : JSON.stringify(pkg, null, 2), ...files }; for (const [p, c] of Object.entries(all)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); } return d; }
export function run(args) { const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }); return { code: r.status, out: r.stdout, err: r.stderr }; }
export const BASE = { name: 'p', version: '1.0.0', description: 'd', keywords: ['k'], license: 'MIT', repository: { type: 'git', url: 'git+https://github.com/a/p.git' }, engines: { node: '>=18' }, homepage: 'https://x' };
