const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env.local');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSnapshots() {
  const { data: anySnap, error: anyErr } = await supabase
    .from('wh_market_snapshots')
    .select('*')
    .limit(10);

  if (anyErr) console.error(anyErr);
  else {
    console.log(`\nTotal sample snapshots in wh_market_snapshots: ${anySnap.length}`);
    if (anySnap.length > 0) {
      console.log('Columns:', Object.keys(anySnap[0]));
      anySnap.forEach(s => {
        console.log(`  [${s.id}] Match: ${s.match_id || s.canonical_match_id} | Type: ${s.market_type} | Line: ${s.numeric_line} | Captured: ${s.captured_at || s.created_at}`);
      });
    }
  }
}

checkSnapshots();
