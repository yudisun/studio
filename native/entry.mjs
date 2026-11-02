import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { shareBackup } from './backup.mjs';

window.StudioNative = Object.freeze({
  isNative: Capacitor.isNativePlatform(),
  exportBackup: (text, filename) => shareBackup(text, filename, {
    filesystem: Filesystem, share: Share, directory: Directory.Cache, encoding: Encoding.UTF8
  })
});
