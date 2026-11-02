const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../native/backup.mjs');
const filename = 'studio-backup-2026-11-01.json';

function harness(failAt) {
  const calls = [];
  let bytes = Buffer.alloc(0);
  const record = (name, options) => {
    calls.push({ name, ...options });
    if (name === failAt) throw new Error('Forced ' + name + ' failure');
  };
  return {
    calls, get bytes() { return bytes; },
    dependencies: {
      directory: 'CACHE', encoding: 'utf8',
      filesystem: {
        async writeFile(options) { record('write', options); bytes = Buffer.from(options.data); },
        async appendFile(options) { record('append', options); bytes = Buffer.concat([bytes, Buffer.from(options.data)]); },
        async getUri(options) { record('uri', options); return { uri: 'file:///cache/' + options.path }; },
        async rmdir(options) { record('cleanup', options); }
      },
      share: { async share(options) { record('share', options); return { activityType: 'save-to-files' }; } }
    }
  };
}

test('shares a complete JSON file and removes only its temporary export directory', async () => {
  const { shareBackup } = await modulePromise;
  const h = harness();
  const text = JSON.stringify({ app: 'studio', version: 1, name: '茶碗 🍵' });
  assert.equal(await shareBackup(text, filename, h.dependencies), 'shared');
  assert.equal(h.bytes.toString('utf8'), text);
  assert.deepEqual(h.calls.map(c => c.name), ['write', 'uri', 'share', 'cleanup']);
  const [write, , share, cleanup] = h.calls;
  assert.equal(write.directory, 'CACHE');
  assert.equal(write.encoding, 'utf8');
  assert.match(write.path, /^studio-exports\/[a-f0-9]{32}\/studio-backup-2026-11-01.json$/);
  assert.deepEqual(share.files, ['file:///cache/' + write.path]);
  assert.equal(cleanup.path + '/' + filename, write.path);
  assert.equal(cleanup.recursive, true);
});

test('a multi-chunk backup keeps exact UTF-8 bytes when an emoji crosses a chunk boundary', async () => {
  const { shareBackup } = await modulePromise;
  const h = harness();
  const text = 'a'.repeat(512 * 1024 - 1) + '🍵' + 'b'.repeat(600000);
  await shareBackup(text, filename, h.dependencies);
  assert.deepEqual(h.bytes, Buffer.from(text));
  assert.equal(h.calls.filter(c => c.name === 'append').length, 2);
});

test('dismissing the iOS sharing sheet is cancellation and still cleans the temporary file', async () => {
  const { shareBackup } = await modulePromise;
  const h = harness();
  h.dependencies.share.share = async () => { throw new Error('Share canceled'); };
  assert.equal(await shareBackup('{}', filename, h.dependencies), 'cancelled');
  assert.equal(h.calls.at(-1).name, 'cleanup');
});

test('failed writes and sharing propagate errors while cleaning partial exports', async () => {
  const { shareBackup } = await modulePromise;
  for (const step of ['write', 'append', 'uri', 'share']) {
    const h = harness(step);
    await assert.rejects(shareBackup('x'.repeat(600000), filename, h.dependencies),
      { message: 'Forced ' + step + ' failure' });
    assert.equal(h.calls.at(-1).name, 'cleanup');
    if (step !== 'share') assert.ok(!h.calls.some(c => c.name === 'share'));
  }
});

test('rejects paths outside the backup filename format before writing anything', async () => {
  const { shareBackup } = await modulePromise;
  const h = harness();
  await assert.rejects(shareBackup('{}', '../collection.json', h.dependencies));
  assert.deepEqual(h.calls, []);
});
