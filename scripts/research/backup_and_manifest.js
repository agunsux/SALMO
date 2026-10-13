/**
 * SALMO / HandicapLab — Dual-Disk Backup & Manifest Generator
 *
 * Synchronizes all harvested and normalized data from primary SSD (Drive C)
 * to secondary physical disk (Drive D: ST500DM009-2DM14C), verifying SHA-256
 * checksums across both media.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRIMARY_ROOT = path.resolve('research/api-football');
const SECONDARY_ROOT = process.env.API_FOOTBALL_VAULT_PATH || path.resolve('D:/SALMO_Backups/api_football_vault_20261013');
const MANIFEST_PATH = path.resolve('docs/research/api-football/API_FOOTBALL_HARVEST_MANIFEST.json');

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(full, arrayOfFiles);
    } else if (entry.isFile()) {
      arrayOfFiles.push(full);
    }
  }
  return arrayOfFiles;
}

async function runBackupAndManifest() {
  console.log('=== DUAL-DISK BACKUP & MANIFEST GENERATION ===');
  console.log(`Primary Source: ${PRIMARY_ROOT}`);
  console.log(`Secondary Backup: ${SECONDARY_ROOT}`);

  if (!fs.existsSync(PRIMARY_ROOT)) {
    throw new Error(`Primary root does not exist: ${PRIMARY_ROOT}`);
  }
  if (!fs.existsSync(SECONDARY_ROOT)) {
    fs.mkdirSync(SECONDARY_ROOT, { recursive: true });
  }

  const primaryFiles = getAllFiles(PRIMARY_ROOT);
  console.log(`Discovered ${primaryFiles.length} files in primary storage.`);

  const manifestEntries = [];
  let totalBytes = 0;
  let copiedCount = 0;
  let verifiedCount = 0;
  let mismatchCount = 0;

  for (const pFile of primaryFiles) {
    const relPath = path.relative(PRIMARY_ROOT, pFile);
    const sFile = path.join(SECONDARY_ROOT, relPath);
    const sDir = path.dirname(sFile);

    const stats = fs.statSync(pFile);
    totalBytes += stats.size;

    // Copy to secondary if not exists or size differs
    let needsCopy = true;
    if (fs.existsSync(sFile)) {
      const sStats = fs.statSync(sFile);
      if (sStats.size === stats.size) {
        needsCopy = false;
      }
    }

    if (needsCopy) {
      if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
      fs.copyFileSync(pFile, sFile);
      copiedCount++;
    }

    // Verify SHA256 on both disks
    const pSha256 = computeFileSha256(pFile);
    const sSha256 = computeFileSha256(sFile);
    const isMatch = pSha256 === sSha256;

    if (isMatch) {
      verifiedCount++;
    } else {
      mismatchCount++;
      console.error(`[MISMATCH] Checksum mismatch on ${relPath}! Primary: ${pSha256}, Secondary: ${sSha256}`);
    }

    manifestEntries.push({
      relative_path: relPath.replace(/\\/g, '/'),
      category: relPath.split(/[\\/]/)[0],
      size_bytes: stats.size,
      sha256_primary: pSha256,
      sha256_secondary: sSha256,
      dual_disk_match: isMatch
    });
  }

  const manifest = {
    generated_at_iso: new Date().toISOString(),
    primary_root: PRIMARY_ROOT.replace(/\\/g, '/'),
    secondary_root: SECONDARY_ROOT.replace(/\\/g, '/'),
    total_files: primaryFiles.length,
    total_bytes: totalBytes,
    total_bytes_formatted: `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`,
    files_copied_this_run: copiedCount,
    files_verified_match: verifiedCount,
    checksum_mismatches: mismatchCount,
    dual_disk_healthy: mismatchCount === 0 && verifiedCount === primaryFiles.length,
    manifest_entries: manifestEntries
  };

  const manDir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(manDir)) fs.mkdirSync(manDir, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n=== BACKUP SUMMARY ===`);
  console.log(`Total Files: ${primaryFiles.length}`);
  console.log(`Total Bytes: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Newly Copied: ${copiedCount}`);
  console.log(`Verified Dual-Disk Matches: ${verifiedCount}`);
  console.log(`Mismatches: ${mismatchCount}`);
  console.log(`Dual-Disk Healthy: ${manifest.dual_disk_healthy}`);
  console.log(`Manifest written to: ${MANIFEST_PATH}`);

  return manifest;
}

if (require.main === module) {
  runBackupAndManifest().catch(err => {
    console.error('Backup error:', err);
    process.exit(1);
  });
}

module.exports = { runBackupAndManifest };
