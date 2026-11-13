const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, realpathSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = require('../server/package.json').version;

test('release installs offline outside OpenIDEA and runs the complete LSP suite', { timeout: 90000 }, t => {
  execFileSync('python3', ['scripts/package.py'], { cwd: root });
  const archive = path.join(root, 'dist', `openidea-jslt-language-server-${version}.tgz`);
  assert.ok(existsSync(archive), 'release must include an installable language-server package');
  const checksums = readFileSync(path.join(root, 'dist/SHA256SUMS'), 'utf8').trim().split('\n');
  const releaseNames = [`nc.jslt-${version}.oiplugin`, `openidea-jslt-language-server-${version}.tgz`];
  assert.deepEqual(checksums.map(line => line.split('  ')[1]).sort(), releaseNames.sort());
  for (const line of checksums) {
    const [digest, name] = line.split('  ');
    assert.equal(digest, createHash('sha256').update(readFileSync(path.join(root, 'dist', name))).digest('hex'));
  }
  const prefix = mkdtempSync(path.join(tmpdir(), 'JSLT 中文 install '));
  t.after(() => rmSync(prefix, { recursive: true, force: true }));
  const npm = process.env.npm_execpath;
  assert.ok(npm, 'run this test through npm');
  const args = ['--global', '--prefix', prefix, '--cache', path.join(prefix, 'cache'), '--offline', '--ignore-scripts', '--no-audit', '--no-fund'];
  execFileSync(process.execPath, [npm, 'install', ...args, archive]);
  const modules = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib/node_modules');
  const installed = path.join(modules, 'openidea-jslt-language-server');
  const cli = path.join(installed, 'bin/openidea-jslt-lsp.cjs');
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), version);
  assert.equal(execFileSync(process.execPath, [cli, '--path'], { encoding: 'utf8' }).trim(), realpathSync(cli));
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /--stdio/);
  for (const arg of ['--version', '--stdio']) {
    const unsupportedNode = spawnSync(process.execPath, ['-e', "Object.defineProperty(process.versions, 'node', {value: '18.20.8'}); require(process.argv[1]);", cli, arg], { encoding: 'utf8' });
    assert.equal(unsupportedNode.status, 1, `${arg} must reject unsupported Node versions`);
    assert.equal(unsupportedNode.stdout, '');
    assert.match(unsupportedNode.stderr, /Node.js 20 or newer/);
  }
  const invalid = spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Unknown argument/);
  assert.ok(readFileSync(path.join(installed, 'LICENSE')).length);
  assert.ok(readFileSync(path.join(installed, 'NOTICE')).length);
  if (process.platform !== 'win32') {
    assert.equal(execFileSync(path.join(prefix, 'bin/openidea-jslt-lsp'), ['--version'], { encoding: 'utf8' }).trim(), version);
  }
  execFileSync(process.execPath, ['--test', 'server/test/lsp.test.js'], {
    cwd: root, env: { ...process.env, JSLT_SERVER: cli }, stdio: 'pipe', timeout: 60000,
  });
  execFileSync(process.execPath, [npm, 'uninstall', ...args, 'openidea-jslt-language-server']);
  assert.equal(existsSync(cli), false);
});
