// Sign + notarise + staple every .dmg artifact.
//
// The afterSign hook (./notarize.cjs) handles the .app bundle. By the time
// it runs, no DMG exists yet — electron-builder creates the DMG after
// afterSign. This hook runs after ALL artifacts are produced, so it can
// finish the job for the DMG container itself (otherwise users hit a
// Gatekeeper prompt the first time they double-click the .dmg).
//
// Hook signature: afterAllArtifactBuild(buildResult) → { artifactPaths, ... }

const { execFileSync } = require('child_process');
const path = require('path');

function findDeveloperIdIdentity() {
  const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  const match = out.match(/"(Developer ID Application:[^"]+)"/);
  if (!match) {
    throw new Error('No "Developer ID Application" identity found in the keychain');
  }
  return match[1];
}

exports.default = async function notarizeDmgs(buildResult) {
  const dmgs = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'));
  if (dmgs.length === 0) {
    console.log('[notarize-dmg] No .dmg artifacts in this build — nothing to do.');
    return;
  }

  const appleId = process.env.NOTARIZE_APPLE_ID;
  const appleIdPassword = process.env.NOTARIZE_APPLE_PASSWORD;
  const teamId = process.env.NOTARIZE_APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize-dmg] Skipping — NOTARIZE_APPLE_* credentials not all set');
    return;
  }

  const identity = findDeveloperIdIdentity();
  console.log(`[notarize-dmg] Using identity: ${identity}`);

  for (const dmgPath of dmgs) {
    const name = path.basename(dmgPath);

    console.log(`[notarize-dmg] Signing ${name}`);
    execFileSync('codesign', ['--sign', identity, '--timestamp', dmgPath], { stdio: 'inherit' });

    console.log(`[notarize-dmg] Submitting ${name} to notarytool (this may take several minutes)`);
    execFileSync(
      'xcrun',
      [
        'notarytool', 'submit', dmgPath,
        '--apple-id', appleId,
        '--password', appleIdPassword,
        '--team-id', teamId,
        '--wait',
      ],
      { stdio: 'inherit' },
    );

    console.log(`[notarize-dmg] Stapling ${name}`);
    try {
      execFileSync('xcrun', ['stapler', 'staple', dmgPath], { stdio: 'inherit' });
      console.log(`[notarize-dmg] Stapled ${name}`);
    } catch (err) {
      console.warn(`[notarize-dmg] Staple failed for ${name} (build will continue): ${err.message}`);
    }
  }
};
