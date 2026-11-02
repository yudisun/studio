// Limit each native bridge call; backups contain base64 photos and can be large.
const CHUNK_SIZE = 512 * 1024;

export async function shareBackup(text, filename, { filesystem, share, directory, encoding }) {
  if (typeof text !== 'string' || !/^studio-backup-\d{4}-\d{2}-\d{2}\.json$/.test(filename)) {
    throw new Error('Invalid backup export');
  }
  const token = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const folder = 'studio-exports/' + token;
  const path = folder + '/' + filename;
  const options = { path, directory, encoding };
  try {
    let offset = 0;
    do {
      let end = Math.min(offset + CHUNK_SIZE, text.length);
      // Never split a Unicode surrogate pair between UTF-8 writes.
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      const data = text.slice(offset, end);
      if (offset === 0) await filesystem.writeFile({ ...options, data, recursive: true });
      else await filesystem.appendFile({ ...options, data });
      offset = end;
    } while (offset < text.length);
    const { uri } = await filesystem.getUri({ path, directory });
    try {
      await share.share({ title: 'Studio backup', files: [uri], dialogTitle: 'Save Studio backup' });
      return 'shared';
    } catch (error) {
      // Capacitor Share on iOS rejects with this message when the sheet is dismissed.
      if (error?.message === 'Share canceled') return 'cancelled';
      throw error;
    }
  } finally {
    // Clean up only this temporary export, including partially written files.
    // A cache cleanup error must not hide a write/share error or report a saved
    // backup as failed. iOS can also reclaim files in the cache directory.
    try { await filesystem.rmdir({ path: folder, directory, recursive: true }); }
    catch (error) { console.warn('Could not remove the temporary backup file.', error); }
  }
}
