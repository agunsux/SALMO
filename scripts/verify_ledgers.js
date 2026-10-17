const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const files = [
  'c:/Users/RYZEN/.antigravity-ide/HandicapLab/data/verification/live_prediction_ledger.jsonl',
  'c:/Users/RYZEN/.antigravity-ide/SALMO/data/verification/live_prediction_ledger.jsonl',
  'c:/Users/RYZEN/.antigravity-ide/SALMO/data/verification/all_leagues_research_ledger.jsonl',
  'c:/Users/RYZEN/.antigravity-ide/SALMO/data/research/multi_league_research_predictions.jsonl'
];

for (const f of files) {
  if (fs.existsSync(f)) {
    const buf = fs.readFileSync(f);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    console.log(`${path.basename(f)} (${f.includes('HandicapLab') ? 'HandicapLab' : 'SALMO'}): ${hash}`);
  } else {
    console.log(`NOT FOUND: ${f}`);
  }
}
