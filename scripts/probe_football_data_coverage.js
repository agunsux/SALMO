/**
 * SALMO.DEV — Phase 2B Step 6: Football-Data.co.uk Multi-League Pinnacle Coverage Probe
 * & Paired Market Benchmark with Holm Step-Down Multiple-Testing Control
 *
 * Strictly READ-ONLY on all canonical artifacts and ledgers (verifies SHA-256 hashes before & after).
 * Free HTTPS GET only to `https://www.football-data.co.uk/mmz4281/{2324|2425|2526}/{CODE}.csv`
 * with a strict >= 2000ms (2100ms enforced) polite delay between HTTP requests.
 * Downloaded CSVs are stored in `data/external/football-data/{season}_{code}.csv` (gitignored).
 * Existing `E0` files are NEVER modified or re-downloaded.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const IMMUTABLE_FILES = [
  {
    relPath: 'data/verification/live_prediction_ledger.jsonl',
    expectedSha256: '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
  },
  {
    relPath: 'data/verification/all_leagues_research_ledger.jsonl',
    expectedSha256: 'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
  },
  {
    relPath: 'data/artifacts/multi_league_team_ratings_v1.0.json',
    expectedSha256: '53466f88ae63f5246f8756f8873f71c472669b0912f09979cfc5e77b82050984',
  },
];

function verifyImmutableHashes(stageLabel) {
  for (const item of IMMUTABLE_FILES) {
    const fullPath = path.resolve(process.cwd(), item.relPath);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    if (actual !== item.expectedSha256) {
      throw new Error(
        `[IMMUTABLE VIOLATION at ${stageLabel}] ${item.relPath}: expected ${item.expectedSha256}, got ${actual}`
      );
    }
  }
}

const PROBE_LEAGUES = [
  { leagueId: 'ESP-LALIGA', fdCode: 'SP1', name: 'La Liga' },
  { leagueId: 'ITA-SERIEA', fdCode: 'I1', name: 'Serie A' },
  { leagueId: 'DEU-BUNDESLIGA', fdCode: 'D1', name: 'Bundesliga' },
  { leagueId: 'FRA-LIGUE1', fdCode: 'F1', name: 'Ligue 1' },
  { leagueId: 'NED-ERE', fdCode: 'N1', name: 'Eredivisie' },
  { leagueId: 'POR-PRIMEIRA', fdCode: 'P1', name: 'Primeira Liga' },
  { leagueId: 'BEL-PRO', fdCode: 'B1', name: 'Pro League' },
  { leagueId: 'SCO-PREM', fdCode: 'SC0', name: 'Scottish Premiership' },
  { leagueId: 'ENG-CHAMP', fdCode: 'E1', name: 'Championship' },
];

const NON_FD_LEAGUES = [
  {
    leagueId: 'USA-MLS',
    status: 'BENCHMARK_UNAVAILABLE',
    reason: 'Not included in football-data.co.uk mmz4281 seasonal archive with Pinnacle AH/OU columns (AHh/AHCh/PCAHH/PCAHA/PC>2.5/PC<2.5).',
  },
  {
    leagueId: 'JPN-J1',
    status: 'BENCHMARK_UNAVAILABLE',
    reason: 'Not included in football-data.co.uk mmz4281 seasonal archive with Pinnacle AH/OU columns (AHh/AHCh/PCAHH/PCAHA/PC>2.5/PC<2.5).',
  },
  {
    leagueId: 'KOR-K1',
    status: 'BENCHMARK_UNAVAILABLE',
    reason: 'Not included in football-data.co.uk mmz4281 seasonal archive with Pinnacle AH/OU columns (AHh/AHCh/PCAHH/PCAHA/PC>2.5/PC<2.5).',
  },
  {
    leagueId: 'SAU-PRO',
    status: 'BENCHMARK_UNAVAILABLE',
    reason: 'Not included in football-data.co.uk mmz4281 seasonal archive with Pinnacle AH/OU columns (AHh/AHCh/PCAHH/PCAHA/PC>2.5/PC<2.5).',
  },
  {
    leagueId: 'IDN-L1',
    status: 'PAUSED',
    reason: 'Paused due to zero historical archive matches (0 matches) and no Pinnacle historical benchmark source.',
  },
];

const SEASONS = ['2324', '2425', '2526'];
const REQUIRED_PINNACLE_COLUMNS = [
  'AHh',
  'PAHH',
  'PAHA',
  'PCAHH',
  'PCAHA',
  'AHCh',
  'P>2.5',
  'P<2.5',
  'PC>2.5',
  'PC<2.5',
];

const DRIBBLE_SEASON_TO_LEAGUE = {
  // ENG-PL
  '80foo89mm28qjvyhjzlpwj28k': 'ENG-PL',
  '1jt5mxgn4q5r6mknmlqv5qjh0': 'ENG-PL',
  '9n12waklv005j8r32sfjj2eqc': 'ENG-PL',
  '51r6ph2woavlbbpk8f29nynf8': 'ENG-PL',
  '6pdwluctev9iebv00r4qqukno': 'ENG-PL',
  // ESP-LALIGA
  'e4idaotcivcpu4rqyvrwbciz8': 'ESP-LALIGA',
  '48s5gykssujtl4derer2njfv8': 'ESP-LALIGA',
  '4x7uzww3jur4re7sgt3mslyj8': 'ESP-LALIGA',
  '80zg2v1cuqcfhphn56u4qpyqc': 'ESP-LALIGA',
  '830epggffy1nfkfyrtpqdwhlg': 'ESP-LALIGA',
  // ITA-SERIEA
  '917vbkpe5rs8mnwskj4jz7ys': 'ITA-SERIEA',
  '3r8v8kb4vebxrtcj5d7ofk1zo': 'ITA-SERIEA',
  'b25u56idqlgo8s1rahhltqd5g': 'ITA-SERIEA',
  'emdmtfr1v8rey2qru3xzfwges': 'ITA-SERIEA',
  '60cryos85i4bp5ul34tt0brx0': 'ITA-SERIEA',
  // DEU-BUNDESLIGA
  'eg8fn8zof4ps7z12vlxa6efx0': 'DEU-BUNDESLIGA',
  '9b9nvvpz477r8yrzmorx8w6qc': 'DEU-BUNDESLIGA',
  '73zebisnu1109jix9yoc09yc4': 'DEU-BUNDESLIGA',
  '2bchmrj23l9u42d68ntcekob8': 'DEU-BUNDESLIGA',
  '8h5xijv2u4mlf5028gso6kw7o': 'DEU-BUNDESLIGA',
  // FRA-LIGUE1
  'b5rz3ukb6kvo9m5neiptb0avo': 'FRA-LIGUE1',
  'bew0mp74n9712w9ns3dsxrf2s': 'FRA-LIGUE1',
  'a7htj8rtzib7a2xx7b3xs04d0': 'FRA-LIGUE1',
  'dbxs75cag7zyip5re0ppsanmc': 'FRA-LIGUE1',
  'bqnc4ccgnrp6pb3bktqet0yz8': 'FRA-LIGUE1',
  // NED-ERE
  'd1k1pqdg2yvw8e8my74yvrdw4': 'NED-ERE',
  '19x9mz32ti233f90h6htylf6c': 'NED-ERE',
  'a5vwgkycmfxord0dj13qhwahg': 'NED-ERE',
  'aouykkl1rt7zo06sg0kbzkbh0': 'NED-ERE',
  '56cvval3nf96u0bf9rzs9h6vo': 'NED-ERE',
  // POR-PRIMEIRA
  '6fdb784d9srg4anqx5ylvagpg': 'POR-PRIMEIRA',
  '6znnaol4m5m4nfb1x4g299lhw': 'POR-PRIMEIRA',
  '5fhu9jbajfxnsuu1x77033sic': 'POR-PRIMEIRA',
  '7l4z25o4hc0fmj9rdspcisdn8': 'POR-PRIMEIRA',
  'a8xa8yfi2tlljxrwyxcst51xw': 'POR-PRIMEIRA',
  // BEL-PRO
  '5wj8l9y4s3484k6puwup793pw': 'BEL-PRO',
  'f0atdrdim0sks9zagwg3an9jo': 'BEL-PRO',
  '809rv2nlzkn8gmn27a2ckuql0': 'BEL-PRO',
  '16lkdpoccbh056r0v0bordo2c': 'BEL-PRO',
  '5ysazl26p4ksxbonjpbamevpw': 'BEL-PRO',
};

const API_FOOTBALL_LEAGUE_MAP = {
  40: 'ENG-CHAMP',
  179: 'SCO-PREM',
};

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadUrlText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'SALMO-Research-Audit/1.0 (polite-rate-limit-2s)',
          Accept: 'text/csv,text/plain,*/*',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadUrlText(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function ensureFootballDataCsvs() {
  const outDir = path.resolve(process.cwd(), 'data/external/football-data');
  fs.mkdirSync(outDir, { recursive: true });

  const downloadLog = [];
  let lastRequestTs = 0;

  for (const lg of PROBE_LEAGUES) {
    if (lg.fdCode === 'E0') continue; // Never touch E0
    for (const season of SEASONS) {
      const fileName = `${season}_${lg.fdCode}.csv`;
      const filePath = path.join(outDir, fileName);
      const url = `https://www.football-data.co.uk/mmz4281/${season}/${lg.fdCode}.csv`;

      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
        downloadLog.push({
          leagueId: lg.leagueId,
          fdCode: lg.fdCode,
          season,
          url,
          filePath: `data/external/football-data/${fileName}`,
          cached: true,
          statusCode: 200,
          bytes: fs.statSync(filePath).size,
          waitMsBeforeRequest: 0,
        });
        continue;
      }

      const now = Date.now();
      const elapsed = now - lastRequestTs;
      let waitedMs = 0;
      if (lastRequestTs > 0 && elapsed < 2100) {
        waitedMs = 2100 - elapsed;
        await sleepMs(waitedMs);
      }

      lastRequestTs = Date.now();
      const res = await downloadUrlText(url);
      if (res.statusCode === 200 && res.body && res.body.length > 50) {
        fs.writeFileSync(filePath, res.body, 'utf8');
      }
      downloadLog.push({
        leagueId: lg.leagueId,
        fdCode: lg.fdCode,
        season,
        url,
        filePath: `data/external/football-data/${fileName}`,
        cached: false,
        statusCode: res.statusCode,
        bytes: res.body ? Buffer.byteLength(res.body, 'utf8') : 0,
        waitMsBeforeRequest: waitedMs,
      });
    }
  }

  return downloadLog;
}

// Multi-league team normalization dictionary mapping Football-Data & Dribble/API-Football names to canonical tokens
const TEAM_ALIASES = {
  // ESP-LALIGA (SP1)
  'ath bilbao': 'athletic club',
  'athletic bilbao': 'athletic club',
  'ath madrid': 'atletico madrid',
  'atletico de madrid': 'atletico madrid',
  'betis': 'real betis',
  'celta': 'celta vigo',
  'celta de vigo': 'celta vigo',
  'espanol': 'espanyol',
  'rcd espanyol': 'espanyol',
  'sociedad': 'real sociedad',
  'vallecano': 'rayo vallecano',
  'alaves': 'deportivo alaves',
  'cadiz cf': 'cadiz',
  'almeria': 'ud almeria',
  'granada cf': 'granada',
  'las palmas': 'ud las palmas',
  'mallorca': 'rcd mallorca',
  'osasuna': 'ca osasuna',
  'sevilla fc': 'sevilla',
  'valencia cf': 'valencia',
  'villarreal cf': 'villarreal',
  'getafe cf': 'getafe',
  'girona fc': 'girona',
  'leganes': 'cd leganes',
  'valladolid': 'real valladolid',
  'oviedo': 'real oviedo',
  'levante ud': 'levante',
  'elche cf': 'elche',

  // ITA-SERIEA (I1)
  'inter': 'inter milan',
  'internazionale': 'inter milan',
  'fc internazionale': 'inter milan',
  'milan': 'ac milan',
  'napoli': 'ssc napoli',
  'SSC Napoli': 'ssc napoli',
  'roma': 'as roma',
  'lazio': 'ss lazio',
  'juventus fc': 'juventus',
  'atalanta bc': 'atalanta',
  'fiorentina': 'acf fiorentina',
  'bologna fc': 'bologna',
  'torino fc': 'torino',
  'udinese calcio': 'udinese',
  'genoacfc': 'genoa',
  'genoa cfc': 'genoa',
  'cagliari calcio': 'cagliari',
  'empoli fc': 'empoli',
  'hellas verona': 'verona',
  'lecce': 'us lecce',
  'monza': 'ac monza',
  'frosinone calcio': 'frosinone',
  'salernitana': 'us salernitana',
  'sassuolo': 'us sassuolo',
  'parma calcio 1913': 'parma',
  'como 1907': 'como',
  'venezia fc': 'venezia',
  'pisa': 'pisa sc',
  'cremonese': 'us cremonese',

  // DEU-BUNDESLIGA (D1)
  'bayern munich': 'bayern munchen',
  'fc bayern munchen': 'bayern munchen',
  'dortmund': 'borussia dortmund',
  'leverkusen': 'bayer leverkusen',
  'bayer 04 leverkusen': 'bayer leverkusen',
  'rb leipzig': 'leipzig',
  'rasenballsport leipzig': 'leipzig',
  'ein frankfurt': 'eintracht frankfurt',
  'frankfurt': 'eintracht frankfurt',
  'm gladbach': 'borussia monchengladbach',
  'monchengladbach': 'borussia monchengladbach',
  'borussia mgladbach': 'borussia monchengladbach',
  'gladbach': 'borussia monchengladbach',
  'stuttgart': 'vfb stuttgart',
  'wolfsburg': 'vfl wolfsburg',
  'freiburg': 'sc freiburg',
  'hoffenheim': 'tsg hoffenheim',
  '1899 hoffenheim': 'tsg hoffenheim',
  'mainz': 'mainz 05',
  '1 fsv mainz 05': 'mainz 05',
  'fsv mainz 05': 'mainz 05',
  'augsburg': 'fc augsburg',
  'werder bremen': 'bremen',
  'sv werder bremen': 'bremen',
  'bochum': 'vfl bochum',
  'vfl bochum 1848': 'vfl bochum',
  'union berlin': '1 fc union berlin',
  'fc union berlin': '1 fc union berlin',
  'heidenheim': '1 fc heidenheim',
  'fc heidenheim': '1 fc heidenheim',
  '1 fc heidenheim 1846': '1 fc heidenheim',
  'fc koln': 'koln',
  '1 fc koln': 'koln',
  'cologne': 'koln',
  'darmstadt': 'darmstadt 98',
  'sv darmstadt 98': 'darmstadt 98',
  'st pauli': 'fc st pauli',
  'holstein kiel': 'kiel',
  'hamburger sv': 'hamburg',
  'hsv': 'hamburg',

  // FRA-LIGUE1 (F1)
  'paris sg': 'paris saint germain',
  'psg': 'paris saint germain',
  'marseille': 'olympique marseille',
  'olympique de marseille': 'olympique marseille',
  'lyon': 'olympique lyonnais',
  'monaco': 'as monaco',
  'lille': 'losc lille',
  'lille osc': 'losc lille',
  'rennes': 'stade rennais',
  'stade rennais fc': 'stade rennais',
  'nice': 'ogc nice',
  'lens': 'rc lens',
  'racing club de lens': 'rc lens',
  'reims': 'stade de reims',
  'strasbourg': 'rc strasbourg',
  'rc strasbourg alsace': 'rc strasbourg',
  'nantes': 'fc nantes',
  'montpellier': 'montpellier hsc',
  'toulouse': 'toulouse fc',
  'brest': 'stade brestois',
  'stade brestois 29': 'stade brestois',
  'lorient': 'fc lorient',
  'clermont': 'clermont foot',
  'clermont foot 63': 'clermont foot',
  'metz': 'fc metz',
  'le havre': 'le havre ac',
  'auxerre': 'aj auxerre',
  'angers': 'angers sco',
  'st etienne': 'saint etienne',
  'as saint etienne': 'saint etienne',
  'paris fc': 'paris fc',

  // NED-ERE (N1)
  'psv': 'psv eindhoven',
  'feyenoord rotterdam': 'feyenoord',
  'ajax amsterdam': 'ajax',
  'afc ajax': 'ajax',
  'az': 'az alkmaar',
  'twente': 'fc twente',
  'fc twente enschede': 'fc twente',
  'utrecht': 'fc utrecht',
  'sparta rotterdam': 'sparta',
  'sparta r': 'sparta',
  'nec': 'nec nijmegen',
  'n e c': 'nec nijmegen',
  'go ahead eagles': 'go ahead',
  'for sittard': 'fortuna sittard',
  'fortuna': 'fortuna sittard',
  'heerenveen': 'sc heerenveen',
  'pec zwolle': 'zwolle',
  'excelsior': 'sbv excelsior',
  'excelsior rotterdam': 'sbv excelsior',
  'volendam': 'fc volendam',
  'vitesse': 'vitesse arnhem',
  'sbv vitesse': 'vitesse arnhem',
  'almere city': 'almere',
  'almere city fc': 'almere',
  'heracles': 'heracles almelo',
  'rkc waalwijk': 'waalwijk',
  'waalwijk': 'waalwijk',
  'willem ii': 'willem ii tilburg',
  'groningen': 'fc groningen',
  'nac breda': 'breda',
  'telstar': 'sc telstar',

  // POR-PRIMEIRA (P1)
  'sp lisbon': 'sporting cp',
  'sporting': 'sporting cp',
  'sporting clube de portugal': 'sporting cp',
  'benfica': 'sl benfica',
  'porto': 'fc porto',
  'sp braga': 'braga',
  'sc braga': 'braga',
  'sporting braga': 'braga',
  'guimaraes': 'vitoria guimaraes',
  'vitoria sc': 'vitoria guimaraes',
  'vitoria de guimaraes': 'vitoria guimaraes',
  'moreirense fc': 'moreirense',
  'arouca': 'fc arouca',
  'famalicao': 'fc famalicao',
  'casa pia': 'casa pia ac',
  'farense': 'sc farense',
  'rio ave fc': 'rio ave',
  'gil vicente fc': 'gil vicente',
  'estoril': 'estoril praia',
  'gd estoril praia': 'estoril praia',
  'boavista fc': 'boavista',
  'estrela': 'estrela amadora',
  'cf estrela da amadora': 'estrela amadora',
  'estrela da amadora': 'estrela amadora',
  'portimonense sc': 'portimonense',
  'vizela': 'fc vizela',
  'chaves': 'gd chaves',
  'desportivo chaves': 'gd chaves',
  'nacional': 'cd nacional',
  'santa clara': 'cd santa clara',
  'avs': 'avs futebol sad',
  'afs': 'avs futebol sad',
  'tondela': 'cd tondela',
  'alverca': 'fc alverca',

  // BEL-PRO (B1)
  'club brugge': 'club brugge kv',
  'anderlecht': 'rsc anderlecht',
  'st gilloise': 'union saint gilloise',
  'union sg': 'union saint gilloise',
  'royale union saint gilloise': 'union saint gilloise',
  'genk': 'krc genk',
  'racing genk': 'krc genk',
  'gent': 'kaa gent',
  'la gantoise': 'kaa gent',
  'antwerp': 'royal antwerp',
  'royal antwerp fc': 'royal antwerp',
  'cercle brugge': 'cercle brugge ksv',
  'mechelen': 'kv mechelen',
  'st truiden': 'sint truidense',
  'sint truiden': 'sint truidense',
  'sint truidense vv': 'sint truidense',
  'standard': 'standard liege',
  'standard de liege': 'standard liege',
  'westerlo': 'kvc westerlo',
  'charleroi': 'royal charleroi',
  'sporting charleroi': 'royal charleroi',
  'royal charleroi sc': 'royal charleroi',
  'oh leuven': 'oud heverlee leuven',
  'oud heverlee leuven': 'oud heverlee leuven',
  'kortrijk': 'kv kortrijk',
  'eupen': 'kas eupen',
  'rwdm': 'rwd molenbeek',
  'molenbeek': 'rwd molenbeek',
  'beerschot va': 'beerschot',
  'k beerschot va': 'beerschot',
  'dender': 'fcv dender eh',
  'fcv dender': 'fcv dender eh',
  'zulte waregem': 'sv zulte waregem',
  'raal la louviere': 'la louviere',

  // SCO-PREM (SC0)
  'celtic fc': 'celtic',
  'rangers fc': 'rangers',
  'hearts': 'heart of midlothian',
  'heart of midlothian': 'heart of midlothian',
  'kilmarnock fc': 'kilmarnock',
  'st mirren': 'saint mirren',
  'dundee': 'dundee fc',
  'dundee utd': 'dundee united',
  'aberdeen fc': 'aberdeen',
  'hibernian fc': 'hibernian',
  'motherwell fc': 'motherwell',
  'ross county': 'ross county',
  'st johnstone': 'saint johnstone',
  'livingston fc': 'livingston',
  'falkirk fc': 'falkirk',

  // ENG-CHAMP (E1)
  'leeds': 'leeds united',
  'leicester': 'leicester city',
  'ipswich': 'ipswich town',
  'southampton fc': 'southampton',
  'west brom': 'west bromwich albion',
  'west bromwich': 'west bromwich albion',
  'norwich': 'norwich city',
  'hull': 'hull city',
  'middlesbrough fc': 'middlesbrough',
  'coventry': 'coventry city',
  'preston': 'preston north end',
  'bristol city': 'bristol city',
  'cardiff': 'cardiff city',
  'millwall fc': 'millwall',
  'swansea': 'swansea city',
  'watford fc': 'watford',
  'sunderland afc': 'sunderland',
  'stoke': 'stoke city',
  'qpr': 'queens park rangers',
  'blackburn': 'blackburn rovers',
  'plymouth': 'plymouth argyle',
  'sheff wed': 'sheffield wednesday',
  'sheff utd': 'sheffield united',
  'birmingham': 'birmingham city',
  'huddersfield': 'huddersfield town',
  'rotherham': 'rotherham united',
  'luton': 'luton town',
  'burnley fc': 'burnley',
  'portsmouth fc': 'portsmouth',
  'derby': 'derby county',
  'oxford': 'oxford united',
  'wrexham afc': 'wrexham',
  'charlton': 'charlton athletic',
};

function normalizeTeam(name) {
  const cleaned = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (TEAM_ALIASES[cleaned]) return TEAM_ALIASES[cleaned];
  // Strip common prefixes/suffixes if not directly in alias table
  const stripped = cleaned
    .replace(/^(fc|ac|as|sc|cd|ud|rcd|rc|ca|cf|vfl|vfb|tsg|1 fc|fsv|sv|bv|kv|krc|kaa|rsc|kvc|kas|gd|sl|sbv)\s+/g, '')
    .replace(/\s+(fc|cf|sc|ac|bc|calcio|kv|ksv|vv|hsc|osc|sco|sad|ac|va)$/g, '')
    .trim();
  return TEAM_ALIASES[stripped] || stripped || cleaned;
}

function teamsMatch(teamA, teamB) {
  const normA = normalizeTeam(teamA);
  const normB = normalizeTeam(teamB);
  if (normA === normB) return true;
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }
  return false;
}

function parseFootballDataDate(dateStr) {
  const parts = String(dateStr || '').trim().split('/');
  if (parts.length !== 3) return null;
  const dd = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  return `${yyyy}-${mm}-${dd}`;
}

function parseLeagueCsvs(fdCode) {
  const dir = path.resolve(process.cwd(), 'data/external/football-data');
  const rows = [];
  const bySeason = {};

  for (const season of SEASONS) {
    const filePath = path.join(dir, `${season}_${fdCode}.csv`);
    if (!fs.existsSync(filePath)) {
      bySeason[season] = { exists: false, rowCount: 0, columnsPresent: {}, filledCounts: {} };
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      bySeason[season] = { exists: true, rowCount: 0, columnsPresent: {}, filledCounts: {} };
      continue;
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    const idx = {};
    headers.forEach((h, i) => {
      idx[h] = i;
    });

    const columnsPresent = {};
    const filledCounts = {};
    for (const col of REQUIRED_PINNACLE_COLUMNS) {
      columnsPresent[col] = idx[col] !== undefined;
      filledCounts[col] = 0;
    }

    let validRows = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const dateIso = parseFootballDataDate(cols[idx['Date']]);
      const home = cols[idx['HomeTeam']];
      const away = cols[idx['AwayTeam']];
      if (!dateIso || !home || !away) continue;
      validRows++;

      for (const col of REQUIRED_PINNACLE_COLUMNS) {
        if (idx[col] !== undefined) {
          const val = parseFloat(cols[idx[col]]);
          if (Number.isFinite(val)) filledCounts[col]++;
        }
      }

      const fthg = parseInt(cols[idx['FTHG']], 10);
      const ftag = parseInt(cols[idx['FTAG']], 10);

      rows.push({
        season,
        dateIso,
        dateMs: new Date(`${dateIso}T12:00:00Z`).getTime(),
        homeRaw: home,
        awayRaw: away,
        fthg: Number.isFinite(fthg) ? fthg : null,
        ftag: Number.isFinite(ftag) ? ftag : null,
        AHh: parseFloat(cols[idx['AHh']]),
        PAHH: parseFloat(cols[idx['PAHH']]),
        PAHA: parseFloat(cols[idx['PAHA']]),
        AHCh: parseFloat(cols[idx['AHCh']]),
        PCAHH: parseFloat(cols[idx['PCAHH']]),
        PCAHA: parseFloat(cols[idx['PCAHA']]),
        P_OVER_25: parseFloat(cols[idx['P>2.5']]),
        P_UNDER_25: parseFloat(cols[idx['P<2.5']]),
        PC_OVER_25: parseFloat(cols[idx['PC>2.5']]),
        PC_UNDER_25: parseFloat(cols[idx['PC<2.5']]),
      });
    }

    bySeason[season] = {
      exists: true,
      rowCount: validRows,
      columnsPresent,
      filledCounts,
    };
  }

  return { rows, bySeason };
}

function loadHistoricalMatchesForProbeLeagues() {
  const byLeague = {};
  for (const lg of PROBE_LEAGUES) byLeague[lg.leagueId] = [];

  const dirs = [
    path.resolve(process.cwd(), 'research/raw_dribble/stage2_probe_captures'),
    path.resolve(process.cwd(), 'research/raw_dribble/stage3b_incremental/captures'),
  ];
  const seenIds = new Set();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.includes('_matches_') || f.includes('team_matches') || f.includes('player_matches')) continue;
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const r of json.rows || []) {
        if (!r.id || seenIds.has(r.id)) continue;
        seenIds.add(r.id);
        const lid = DRIBBLE_SEASON_TO_LEAGUE[r.season_id];
        if (!lid || !byLeague[lid]) continue;
        if (r.status !== 'PLAYED' || r.home_score === null || r.away_score === null) continue;
        if (!r.description || !r.description.includes(' vs ')) continue;
        const [home, away] = r.description.split(' vs ').map((s) => s.trim());
        byLeague[lid].push({
          id: r.id,
          kickoff: r.date,
          home_team: home,
          away_team: away,
          home_goals: Number(r.home_score),
          away_goals: Number(r.away_score),
          source: 'Dribble360',
        });
      }
    }
  }

  const e66Dir = path.resolve(process.cwd(), '..', 'HandicapLab', 'data', 'cache', 'epic66');
  if (fs.existsSync(e66Dir)) {
    for (const [afIdStr, lid] of Object.entries(API_FOOTBALL_LEAGUE_MAP)) {
      if (!byLeague[lid]) continue;
      for (const season of ['2024', '2025']) {
        const fpath = path.join(e66Dir, `apifootball_${afIdStr}_${season}.json`);
        if (!fs.existsSync(fpath)) continue;
        const items = JSON.parse(fs.readFileSync(fpath, 'utf8'));
        for (const item of items) {
          const st = item.fixture?.status?.short;
          if (st !== 'FT' && st !== 'AET' && st !== 'PEN') continue;
          const hg = item.goals?.home;
          const ag = item.goals?.away;
          if (hg === null || hg === undefined || ag === null || ag === undefined) continue;
          const id = `af_${item.fixture.id}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          byLeague[lid].push({
            id,
            kickoff: item.fixture.date,
            home_team: item.teams.home.name,
            away_team: item.teams.away.name,
            home_goals: Number(hg),
            away_goals: Number(ag),
            source: 'API-Football-Archive',
          });
        }
      }
    }
  }

  for (const lg of PROBE_LEAGUES) {
    byLeague[lg.leagueId].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }

  return byLeague;
}

function matchFixtureToCsv(match, csvRows, usedCsvIndices) {
  const matchDateIso = match.kickoff.slice(0, 10);
  const matchDateMs = new Date(`${matchDateIso}T12:00:00Z`).getTime();

  // Pass 1: exact date or +-1 day AND both teams match AND score matches
  for (let i = 0; i < csvRows.length; i++) {
    if (usedCsvIndices.has(i)) continue;
    const r = csvRows[i];
    if (Math.abs(r.dateMs - matchDateMs) > 36 * 3600 * 1000) continue;
    if (r.fthg !== null && r.ftag !== null && (r.fthg !== match.home_goals || r.ftag !== match.away_goals)) {
      continue;
    }
    if (teamsMatch(match.home_team, r.homeRaw) && teamsMatch(match.away_team, r.awayRaw)) {
      usedCsvIndices.add(i);
      return r;
    }
  }

  // Pass 2: exact date AND exact score AND at least one team matches (handles unmapped alias on the other team)
  const candidates = [];
  for (let i = 0; i < csvRows.length; i++) {
    if (usedCsvIndices.has(i)) continue;
    const r = csvRows[i];
    if (Math.abs(r.dateMs - matchDateMs) > 36 * 3600 * 1000) continue;
    if (r.fthg === match.home_goals && r.ftag === match.away_goals) {
      if (teamsMatch(match.home_team, r.homeRaw) || teamsMatch(match.away_team, r.awayRaw)) {
        candidates.push({ idx: i, row: r });
      }
    }
  }
  if (candidates.length === 1) {
    usedCsvIndices.add(candidates[0].idx);
    return candidates[0].row;
  }

  return null;
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = k * Math.log(lambda) - lambda;
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function dcTau(x, y, lambdaHome, lambdaAway, rho) {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1.0;
}

function buildGrid(lambdaHome, lambdaAway, rho) {
  const maxGoals = 10;
  const pH = [];
  const pA = [];
  for (let g = 0; g <= maxGoals; g++) {
    pH.push(poissonPmf(g, lambdaHome));
    pA.push(poissonPmf(g, lambdaAway));
  }
  const grid = [];
  let sum = 0;
  for (let i = 0; i <= maxGoals; i++) {
    grid[i] = [];
    for (let j = 0; j <= maxGoals; j++) {
      const tau = Math.max(0, dcTau(i, j, lambdaHome, lambdaAway, rho));
      const p = pH[i] * pA[j] * tau;
      grid[i][j] = p;
      sum += p;
    }
  }
  if (sum > 0) {
    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) {
        grid[i][j] /= sum;
      }
    }
  }
  return grid;
}

function estimateLambdasAtIndex(matches, evalIdx) {
  const halfLifeDays = 180;
  const ln2 = Math.LN2;
  const evalTime = new Date(matches[evalIdx].kickoff).getTime();

  let totalWeight = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const teamStats = {};

  for (let i = 0; i < evalIdx; i++) {
    const m = matches[i];
    const t = new Date(m.kickoff).getTime();
    if (t >= evalTime) continue;
    const ageDays = Math.max(0, (evalTime - t) / (1000 * 3600 * 24));
    const w = Math.exp((-ln2 * ageDays) / halfLifeDays);

    totalWeight += w;
    totalHomeGoals += w * m.home_goals;
    totalAwayGoals += w * m.away_goals;

    if (!teamStats[m.home_team]) {
      teamStats[m.home_team] = { wHome: 0, gfHome: 0, gaHome: 0, wAway: 0, gfAway: 0, gaAway: 0 };
    }
    if (!teamStats[m.away_team]) {
      teamStats[m.away_team] = { wHome: 0, gfHome: 0, gaHome: 0, wAway: 0, gfAway: 0, gaAway: 0 };
    }

    teamStats[m.home_team].wHome += w;
    teamStats[m.home_team].gfHome += w * m.home_goals;
    teamStats[m.home_team].gaHome += w * m.away_goals;

    teamStats[m.away_team].wAway += w;
    teamStats[m.away_team].gfAway += w * m.away_goals;
    teamStats[m.away_team].gaAway += w * m.home_goals;
  }

  const avgHome = totalWeight > 0 ? totalHomeGoals / totalWeight : 1.45;
  const avgAway = totalWeight > 0 ? totalAwayGoals / totalWeight : 1.15;
  const priorW = 6.0;

  const target = matches[evalIdx];
  const hs = teamStats[target.home_team] || { wHome: 0, gfHome: 0, gaHome: 0, wAway: 0, gfAway: 0, gaAway: 0 };
  const as = teamStats[target.away_team] || { wHome: 0, gfHome: 0, gaHome: 0, wAway: 0, gfAway: 0, gaAway: 0 };

  const homeAtt = (hs.gfHome + hs.gfAway + priorW * (avgHome + avgAway) * 0.5) / (hs.wHome + hs.wAway + priorW);
  const homeDef = (hs.gaHome + hs.gaAway + priorW * (avgHome + avgAway) * 0.5) / (hs.wHome + hs.wAway + priorW);
  const awayAtt = (as.gfHome + as.gfAway + priorW * (avgHome + avgAway) * 0.5) / (as.wHome + as.wAway + priorW);
  const awayDef = (as.gaHome + as.gaAway + priorW * (avgHome + avgAway) * 0.5) / (as.wHome + as.wAway + priorW);

  const leagueAvg = (avgHome + avgAway) * 0.5;
  const lambdaHome = Math.max(0.25, Math.min(4.5, (homeAtt / leagueAvg) * (awayDef / leagueAvg) * avgHome));
  const lambdaAway = Math.max(0.25, Math.min(4.5, (awayAtt / leagueAvg) * (homeDef / leagueAvg) * avgAway));

  return { lambdaHome, lambdaAway };
}

function singleLineAhStats(grid, line, homeGoals, awayGoals) {
  let pWin = 0;
  let pPush = 0;
  let pLoss = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const d = i - j + line;
      if (d > 1e-9) pWin += grid[i][j];
      else if (Math.abs(d) <= 1e-9) pPush += grid[i][j];
      else pLoss += grid[i][j];
    }
  }
  const actualDiff = homeGoals - awayGoals + line;
  const actualOutcome = actualDiff > 1e-9 ? 1.0 : Math.abs(actualDiff) <= 1e-9 ? 0.5 : 0.0;
  const nonPushMass = pWin + pLoss;
  const pConditionalWin = nonPushMass > 0 ? pWin / nonPushMass : 0.5;
  return { pWin, pPush, pLoss, pConditionalWin, actualOutcome };
}

function decomposeLineToSingleLegs(line) {
  const r = Math.round(line * 4) / 4;
  const mod = Math.abs(r * 4) % 2;
  if (mod === 1) {
    return [r - 0.25, r + 0.25];
  }
  return [r];
}

function devigTwoWay(oddsHomeOrOver, oddsAwayOrUnder) {
  if (!Number.isFinite(oddsHomeOrOver) || !Number.isFinite(oddsAwayOrUnder)) return null;
  if (oddsHomeOrOver <= 1.0 || oddsAwayOrUnder <= 1.0) return null;
  const inv1 = 1 / oddsHomeOrOver;
  const inv2 = 1 / oddsAwayOrUnder;
  const sum = inv1 + inv2;
  return {
    p1: inv1 / sum,
    p2: inv2 / sum,
    overround: sum - 1,
  };
}

function clampProb(p) {
  return Math.max(1e-6, Math.min(1 - 1e-6, p));
}

function brier1(p, y) {
  return (p - y) * (p - y);
}

function logLoss1(p, y) {
  const pc = clampProb(p);
  return -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round6(x) {
  return Number(x.toFixed(6));
}

function bootstrapPairedDiff(modelLosses, marketLosses, iterations = 2000, seed = 20261012) {
  const n = modelLosses.length;
  if (n === 0) {
    return {
      n: 0,
      modelMean: 0,
      marketMean: 0,
      deltaMean: 0,
      ci95: [0, 0],
      pValueModelBeatsMarket: 1,
    };
  }
  const diffs = new Array(n);
  let sumM = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumM += modelLosses[i];
    sumB += marketLosses[i];
    diffs[i] = modelLosses[i] - marketLosses[i];
  }
  const modelMean = sumM / n;
  const marketMean = sumB / n;
  const deltaMean = (sumM - sumB) / n;

  let s = seed >>> 0;
  function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  }

  const bootMeans = new Array(iterations);
  let nonNegativeCount = 0;
  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += diffs[Math.floor(rand() * n)];
    }
    const bm = sum / n;
    bootMeans[b] = bm;
    if (bm >= 0) nonNegativeCount++;
  }
  bootMeans.sort((a, b) => a - b);
  const lo = bootMeans[Math.floor(iterations * 0.025)];
  const hi = bootMeans[Math.floor(iterations * 0.975)];
  const pValueModelBeatsMarket = nonNegativeCount / iterations;

  return {
    n,
    modelMean: round6(modelMean),
    marketMean: round6(marketMean),
    deltaMean: round6(deltaMean),
    ci95: [round6(lo), round6(hi)],
    pValueModelBeatsMarket: round6(pValueModelBeatsMarket),
  };
}

function evaluatePairedWindow(matches, matchedCsvByMatchIdx, startIdx) {
  const ahModelBrier = [];
  const ahCloseBrier = [];
  const ahModelLL = [];
  const ahCloseLL = [];
  let ahPushesExcluded = 0;
  let ahTotalLegs = 0;
  let ahMatchedFixtures = 0;

  const ahSingleModelBrier = [];
  const ahSingleCloseBrier = [];
  const ahSingleModelLL = [];
  const ahSingleCloseLL = [];
  let ahSinglePushesExcluded = 0;

  const ouModelBrier = [];
  const ouCloseBrier = [];
  const ouModelLL = [];
  const ouCloseLL = [];
  let ouMatchedFixtures = 0;

  for (let idx = startIdx; idx < matches.length; idx++) {
    const csv = matchedCsvByMatchIdx.get(idx);
    if (!csv) continue;

    const m = matches[idx];
    const { lambdaHome, lambdaAway } = estimateLambdasAtIndex(matches, idx);
    const grid = buildGrid(lambdaHome, lambdaAway, -0.08);

    const ahClose = devigTwoWay(csv.PCAHH, csv.PCAHA);
    if (ahClose && Number.isFinite(csv.AHCh)) {
      ahMatchedFixtures++;
      const legs = decomposeLineToSingleLegs(csv.AHCh);
      const isQuarterLine = legs.length === 2;
      for (const legLine of legs) {
        ahTotalLegs++;
        const st = singleLineAhStats(grid, legLine, m.home_goals, m.away_goals);
        if (st.actualOutcome === 0.5) {
          ahPushesExcluded++;
          if (!isQuarterLine) ahSinglePushesExcluded++;
          continue;
        }
        ahModelBrier.push(brier1(st.pConditionalWin, st.actualOutcome));
        ahCloseBrier.push(brier1(ahClose.p1, st.actualOutcome));
        ahModelLL.push(logLoss1(st.pConditionalWin, st.actualOutcome));
        ahCloseLL.push(logLoss1(ahClose.p1, st.actualOutcome));

        if (!isQuarterLine) {
          ahSingleModelBrier.push(brier1(st.pConditionalWin, st.actualOutcome));
          ahSingleCloseBrier.push(brier1(ahClose.p1, st.actualOutcome));
          ahSingleModelLL.push(logLoss1(st.pConditionalWin, st.actualOutcome));
          ahSingleCloseLL.push(logLoss1(ahClose.p1, st.actualOutcome));
        }
      }
    }

    const ouClose = devigTwoWay(csv.PC_OVER_25, csv.PC_UNDER_25);
    if (ouClose) {
      ouMatchedFixtures++;
      let pOver25 = 0;
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          if (i + j > 2.5) pOver25 += grid[i][j];
        }
      }
      const actualOver25 = m.home_goals + m.away_goals > 2.5 ? 1.0 : 0.0;
      ouModelBrier.push(brier1(pOver25, actualOver25));
      ouCloseBrier.push(brier1(ouClose.p1, actualOver25));
      ouModelLL.push(logLoss1(pOver25, actualOver25));
      ouCloseLL.push(logLoss1(ouClose.p1, actualOver25));
    }
  }

  return {
    nEvalTotal: matches.length - startIdx,
    ahMatchedFixtures,
    ouMatchedFixtures,
    ahBinaryNoPush: {
      totalLegs: ahTotalLegs,
      pushesExcluded: ahPushesExcluded,
      resolvedLegs: ahModelBrier.length,
      brier: bootstrapPairedDiff(ahModelBrier, ahCloseBrier, 2000, 20261012),
      logLoss: bootstrapPairedDiff(ahModelLL, ahCloseLL, 2000, 20261013),
    },
    ahStrictSingleLineSubset: {
      pushesExcluded: ahSinglePushesExcluded,
      resolvedLegs: ahSingleModelBrier.length,
      brier: bootstrapPairedDiff(ahSingleModelBrier, ahSingleCloseBrier, 2000, 20261014),
      logLoss: bootstrapPairedDiff(ahSingleModelLL, ahSingleCloseLL, 2000, 20261015),
    },
    ou25: {
      resolvedLegs: ouModelBrier.length,
      brier: bootstrapPairedDiff(ouModelBrier, ouCloseBrier, 2000, 20261016),
      logLoss: bootstrapPairedDiff(ouModelLL, ouCloseLL, 2000, 20261017),
    },
  };
}

function runHolmStepDown(candidates, alpha = 0.05) {
  const K = candidates.length;
  const indexed = candidates.map((c, idx) => ({ ...c, origIdx: idx }));
  indexed.sort((a, b) => a.rawPValue - b.rawPValue);

  let failedAt = -1;
  let runningMaxAdjP = 0;
  const out = new Array(K);

  for (let i = 0; i < K; i++) {
    const rank = i + 1;
    const divisor = K - rank + 1;
    const holmThreshold = round6(alpha / divisor);
    const rawAdj = Math.min(1, indexed[i].rawPValue * divisor);
    runningMaxAdjP = Math.max(runningMaxAdjP, rawAdj);
    const adjustedPValue = round6(runningMaxAdjP);

    if (failedAt === -1 && !(indexed[i].rawPValue < holmThreshold && indexed[i].eligibleForSignificance)) {
      failedAt = rank;
    }
    const passedHolm = failedAt === -1;

    out[indexed[i].origIdx] = {
      ...indexed[i],
      rank,
      familySizeK: K,
      holmThreshold,
      adjustedPValue,
      passedHolm,
    };
  }
  return out;
}

async function runFootballDataProbe() {
  verifyImmutableHashes('before Step 6 probe');

  const downloadLog = await ensureFootballDataCsvs();
  const matchesByLeague = loadHistoricalMatchesForProbeLeagues();

  const leagueProbes = {};
  const holmCandidatesPrimary = [];
  const holmCandidatesExpanded = [];

  for (const lg of PROBE_LEAGUES) {
    const { rows: csvRows, bySeason } = parseLeagueCsvs(lg.fdCode);
    const matches = matchesByLeague[lg.leagueId] || [];
    const usedCsvIndices = new Set();
    const matchedCsvByMatchIdx = new Map();

    let totalMatched = 0;
    let totalMatchedWithPinnacleAh = 0;
    let totalMatchedWithPinnacleOu = 0;

    for (let idx = 0; idx < matches.length; idx++) {
      const csv = matchFixtureToCsv(matches[idx], csvRows, usedCsvIndices);
      if (csv) {
        matchedCsvByMatchIdx.set(idx, csv);
        totalMatched++;
        if (Number.isFinite(csv.AHCh) && Number.isFinite(csv.PCAHH) && Number.isFinite(csv.PCAHA)) {
          totalMatchedWithPinnacleAh++;
        }
        if (Number.isFinite(csv.PC_OVER_25) && Number.isFinite(csv.PC_UNDER_25)) {
          totalMatchedWithPinnacleOu++;
        }
      }
    }

    // Count matches inside the 2023-08-01+ window (when 2324 CSV starts) to report true join rate in overlap period
    const matchesSince2324 = matches.filter((m) => m.kickoff >= '2023-08-01').length;
    const evalCount = Math.min(300, Math.floor(matches.length * 0.45));
    const primaryEvalStart = matches.length - evalCount;
    const expandedEvalStart = Math.min(380, Math.max(50, matches.length - 400));

    const primaryWindow = evaluatePairedWindow(matches, matchedCsvByMatchIdx, primaryEvalStart);
    const expandedWindow = evaluatePairedWindow(matches, matchedCsvByMatchIdx, expandedEvalStart);

    // Find last date in CSV with Pinnacle closing AH/OU populated (documents the mid-Jan 2026 feed cutoff in 2526 CSVs)
    let lastPinnaclePopulatedDate = null;
    for (const r of csvRows) {
      if (Number.isFinite(r.PCAHH) && Number.isFinite(r.PCAHA) && Number.isFinite(r.PC_OVER_25)) {
        if (!lastPinnaclePopulatedDate || r.dateIso > lastPinnaclePopulatedDate) {
          lastPinnaclePopulatedDate = r.dateIso;
        }
      }
    }

    // Aggregate column availability across seasons 2324, 2425, 2526
    const aggregateColumns = {};
    let totalCsvRows = 0;
    for (const s of SEASONS) {
      totalCsvRows += bySeason[s]?.rowCount || 0;
    }
    for (const col of REQUIRED_PINNACLE_COLUMNS) {
      const presentInAllSeasons = SEASONS.every((s) => bySeason[s]?.columnsPresent?.[col] === true);
      const totalFilled = SEASONS.reduce((acc, s) => acc + (bySeason[s]?.filledCounts?.[col] || 0), 0);
      aggregateColumns[col] = {
        presentInAllSeasons,
        filledRows: totalFilled,
        totalCsvRows,
        fillRate: totalCsvRows > 0 ? round6(totalFilled / totalCsvRows) : 0,
      };
    }

    leagueProbes[lg.leagueId] = {
      leagueId: lg.leagueId,
      fdCode: lg.fdCode,
      name: lg.name,
      seasonsProbed: SEASONS,
      lastPinnaclePopulatedDateInCsv: lastPinnaclePopulatedDate,
      bySeason,
      aggregateColumns,
      joinSummary: {
        nHistoricalTotal: matches.length,
        nHistoricalSince2023_08: matchesSince2324,
        totalCsvRows,
        totalMatchedToHistorical: totalMatched,
        totalMatchedWithPinnacleAh,
        totalMatchedWithPinnacleOu,
        overlapJoinRateSince2023_08:
          matchesSince2324 > 0 ? round6(totalMatched / matchesSince2324) : 0,
        primaryEvalWindow: {
          warmUpMatches: primaryEvalStart,
          nEval: matches.length - primaryEvalStart,
          ahMatchedFixtures: primaryWindow.ahMatchedFixtures,
          ahResolvedLegs: primaryWindow.ahBinaryNoPush.resolvedLegs,
          ouMatchedFixtures: primaryWindow.ouMatchedFixtures,
          ouResolvedLegs: primaryWindow.ou25.resolvedLegs,
        },
        expandedWalkForwardWindow: {
          warmUpMatches: expandedEvalStart,
          nEval: matches.length - expandedEvalStart,
          ahMatchedFixtures: expandedWindow.ahMatchedFixtures,
          ahResolvedLegs: expandedWindow.ahBinaryNoPush.resolvedLegs,
          ouMatchedFixtures: expandedWindow.ouMatchedFixtures,
          ouResolvedLegs: expandedWindow.ou25.resolvedLegs,
        },
      },
      primaryBenchmark: primaryWindow,
      expandedWalkForwardBenchmark: expandedWindow,
    };

    // Add to Holm family if >= 100 matched legs in canonical 300-match primary window
    for (const [mktKey, mktObj] of [
      ['AH', primaryWindow.ahBinaryNoPush],
      ['OU_2_5', primaryWindow.ou25],
    ]) {
      if (mktObj.resolvedLegs >= 100) {
        holmCandidatesPrimary.push({
          leagueId: lg.leagueId,
          market: mktKey,
          window: 'PRIMARY_CANONICAL_NEVAL',
          resolvedLegs: mktObj.resolvedLegs,
          brierDelta: mktObj.brier.deltaMean,
          brierCi95: mktObj.brier.ci95,
          logLossDelta: mktObj.logLoss.deltaMean,
          logLossCi95: mktObj.logLoss.ci95,
          rawPValue: mktObj.brier.pValueModelBeatsMarket,
          eligibleForSignificance:
            mktObj.brier.ci95[1] < 0 && mktObj.logLoss.ci95[1] < 0,
        });
      }
    }

    // Add to Expanded Walk-Forward Holm family if >= 100 matched legs
    for (const [mktKey, mktObj] of [
      ['AH', expandedWindow.ahBinaryNoPush],
      ['OU_2_5', expandedWindow.ou25],
    ]) {
      if (mktObj.resolvedLegs >= 100) {
        holmCandidatesExpanded.push({
          leagueId: lg.leagueId,
          market: mktKey,
          window: 'EXPANDED_WALKFORWARD',
          resolvedLegs: mktObj.resolvedLegs,
          brierDelta: mktObj.brier.deltaMean,
          brierCi95: mktObj.brier.ci95,
          logLossDelta: mktObj.logLoss.deltaMean,
          logLossCi95: mktObj.logLoss.ci95,
          rawPValue: mktObj.brier.pValueModelBeatsMarket,
          eligibleForSignificance:
            mktObj.brier.ci95[1] < 0 && mktObj.logLoss.ci95[1] < 0,
        });
      }
    }
  }

  const holmPrimaryResults = runHolmStepDown(holmCandidatesPrimary, 0.05);
  const holmExpandedResults = runHolmStepDown(holmCandidatesExpanded, 0.05);

  const report = {
    schemaVersion: '1.0.0-phase2b-step6-football-data-probe',
    generatedAt: new Date().toISOString(),
    networkCompliance: {
      allowedPattern: 'https://www.football-data.co.uk/mmz4281/{2324|2425|2526}/{CODE}.csv',
      minDelayMsEnforced: 2100,
      e0Modified: false,
      totalFilesCheckedOrDownloaded: downloadLog.length,
      downloadLog,
    },
    probedLeagues: leagueProbes,
    nonFootballDataLeagues: NON_FD_LEAGUES,
    holmStepDownMultipleTesting: {
      alpha: 0.05,
      primaryWindowFamily: {
        familySizeK: holmPrimaryResults.length,
        promotedCount: holmPrimaryResults.filter((r) => r.passedHolm).length,
        results: holmPrimaryResults,
      },
      expandedWalkForwardFamily: {
        familySizeK: holmExpandedResults.length,
        promotedCount: holmExpandedResults.filter((r) => r.passedHolm).length,
        results: holmExpandedResults,
      },
    },
  };

  const outPath = path.resolve(process.cwd(), 'data/verification/football_data_coverage_probe.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  verifyImmutableHashes('after Step 6 probe');
  return report;
}

if (require.main === module) {
  runFootballDataProbe()
    .then((report) => {
      console.log('=== PHASE 2B STEP 6: FOOTBALL-DATA COVERAGE PROBE SUMMARY ===');
      for (const lg of PROBE_LEAGUES) {
        const p = report.probedLeagues[lg.leagueId];
        const j = p.joinSummary;
        const expAh = p.expandedWalkForwardBenchmark.ahBinaryNoPush;
        const expOu = p.expandedWalkForwardBenchmark.ou25;
        console.log(
          `${lg.leagueId.padEnd(15)} (${lg.fdCode.padEnd(3)}): CSV=${j.totalCsvRows} | Matched=${j.totalMatchedToHistorical}/${j.nHistoricalSince2023_08} (${(j.overlapJoinRateSince2023_08 * 100).toFixed(1)}%) | Primary[AHlegs=${j.primaryEvalWindow.ahResolvedLegs}, OU=${j.primaryEvalWindow.ouResolvedLegs}] | Exp[AH dBrier=${expAh.brier.deltaMean >= 0 ? '+' : ''}${expAh.brier.deltaMean} (n=${expAh.resolvedLegs}), OU dBrier=${expOu.brier.deltaMean >= 0 ? '+' : ''}${expOu.brier.deltaMean} (n=${expOu.resolvedLegs})]`
        );
      }
      console.log(
        `Holm Step-Down Primary (K=${report.holmStepDownMultipleTesting.primaryWindowFamily.familySizeK}): promoted=${report.holmStepDownMultipleTesting.primaryWindowFamily.promotedCount}`
      );
      console.log(
        `Holm Step-Down Expanded (K=${report.holmStepDownMultipleTesting.expandedWalkForwardFamily.familySizeK}): promoted=${report.holmStepDownMultipleTesting.expandedWalkForwardFamily.promotedCount}`
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runFootballDataProbe };
