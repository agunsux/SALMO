const fs = require('fs');
const ts = require('typescript');
const path = require('path');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function (module, filename) {
    const content = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    module._compile(compiled.outputText, filename);
  };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const { settleProductionLedger } = require('./settle_production_ledger.ts');

settleProductionLedger({ dryRun })
  .then(res => {
    console.log('[COMPLETED] Settlement execution finished.');
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('[FATAL] Settlement failed:', err);
    process.exit(1);
  });
