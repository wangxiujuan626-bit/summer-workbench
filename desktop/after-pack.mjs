import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Electron's linker signature is not enough for a downloaded macOS app:
 * Gatekeeper can report the app as damaged when the bundle has no sealed
 * resource signature. We cannot notarize without an Apple Developer
 * certificate, but we can still apply a complete ad-hoc signature so the
 * bundle is internally consistent and can be opened after the user's normal
 * first-run confirmation.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productName}.app`);
  execFileSync('/usr/bin/codesign', [
    '--deep',
    '--force',
    '--verbose',
    '--sign',
    '-',
    '--timestamp=none',
    appPath,
  ], { stdio: 'inherit' });
}
