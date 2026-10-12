import fs from 'fs';
import path from 'path';
import { runProductionSettlement, SettlementRunnerOptions } from '../src/engine/settlement/productionSettlementRunner';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const l of lines) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i !== -1) {
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

export async function settleProductionLedger(options: SettlementRunnerOptions = {}) {
  loadEnv();
  return runProductionSettlement(options);
}

if (require.main === module) {
  settleProductionLedger().catch(err => {
    console.error('[FATAL] Settlement failed:', err);
    process.exit(1);
  });
}
