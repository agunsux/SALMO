const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function print3Layak() {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('verdict', 'LAYAK')
    .gte('created_at', '2026-10-16T00:00:00Z')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} LAYAK picks from 2026-10-16 run:`);
  data.forEach((pick, i) => {
    console.log(`\n=== CANDIDATE ${i + 1} ===`);
    console.log(JSON.stringify(pick, null, 2));
    if (typeof pick.reasoning === 'string') {
      try {
        console.log('Parsed Reasoning:', JSON.stringify(JSON.parse(pick.reasoning), null, 2));
      } catch (e) {
        console.log('Raw Reasoning:', pick.reasoning);
      }
    }
  });
}

print3Layak().catch(console.error);
