const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const ids = ["224dd97b-bee6-4875-b97a-f14d9607995a", "abe7d4da-0659-4869-b560-635a017710f5", "cbd13e02-6be4-4b22-95d9-59c26eb603bc"];
  const { data, error } = await sb.from("daily_picks").select("*").in("id", ids);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
})();
