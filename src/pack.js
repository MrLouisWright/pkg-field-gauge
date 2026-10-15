// Lint what npm would actually publish: the file list from `npm pack --dry-run --json`.
import { execFileSync } from 'node:child_process';

/**
 * Files npm would put in the tarball (paths relative to the package root), plus size info.
 * @param {string} dir
 * @returns {{ files: string[], size: number, unpackedSize: number, entryCount: number }}
 */
export function packedFiles(dir) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let out;
  try { out = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' }); } catch (e) { throw new Error(`npm pack --dry-run failed: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
  const j = JSON.parse(out.slice(out.indexOf('[')));
  const info = Array.isArray(j) ? j[0] : j;
  return { files: info.files.map((f) => f.path), size: info.size, unpackedSize: info.unpackedSize, entryCount: info.entryCount };
}
