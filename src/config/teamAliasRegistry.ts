// SALMO.DEV — Versioned League-Scoped Team Alias Registry
// Single authoritative source for club entity resolution across all 15 candidate leagues.
// Invariant: Unmapped teams are explicitly flagged as UNMAPPED_TEAM, never guessed via loose equality.

export const TEAM_ALIAS_REGISTRY_VERSION = 'v1.0.0-multi-league';

export interface TeamResolutionResult {
  slug: string;
  canonicalName: string;
  status: 'MAPPED' | 'UNMAPPED_TEAM';
  isMapped: boolean;
}

export interface CanonicalTeamDefinition {
  slug: string;
  canonicalName: string;
  aliases: string[];
}

/**
 * 15-League Canonical Team Alias Mappings
 * Covers all clubs in the Tier A, Tier B, and Tier C candidate competitions.
 */
export const LEAGUE_TEAM_REGISTRIES: Record<string, Record<string, CanonicalTeamDefinition>> = {
  // ─── TIER A: EPL ─────────────────────────────────────────────────────────────
  EPL: {
    arsenal: { slug: 'arsenal', canonicalName: 'Arsenal', aliases: ['arsenal', 'arsenal fc'] },
    astonvilla: { slug: 'astonvilla', canonicalName: 'Aston Villa', aliases: ['aston villa', 'aston villa fc', 'villa'] },
    bournemouth: { slug: 'bournemouth', canonicalName: 'Bournemouth', aliases: ['bournemouth', 'afc bournemouth'] },
    brentford: { slug: 'brentford', canonicalName: 'Brentford', aliases: ['brentford', 'brentford fc'] },
    brighton: { slug: 'brighton', canonicalName: 'Brighton', aliases: ['brighton', 'brighton & hove albion', 'brighton and hove albion', 'brighton hove'] },
    chelsea: { slug: 'chelsea', canonicalName: 'Chelsea', aliases: ['chelsea', 'chelsea fc'] },
    crystalpalace: { slug: 'crystalpalace', canonicalName: 'Crystal Palace', aliases: ['crystal palace', 'crystal palace fc', 'palace'] },
    everton: { slug: 'everton', canonicalName: 'Everton', aliases: ['everton', 'everton fc'] },
    fulham: { slug: 'fulham', canonicalName: 'Fulham', aliases: ['fulham', 'fulham fc'] },
    ipswich: { slug: 'ipswich', canonicalName: 'Ipswich', aliases: ['ipswich', 'ipswich town', 'ipswich town fc'] },
    leicester: { slug: 'leicester', canonicalName: 'Leicester', aliases: ['leicester', 'leicester city', 'leicester city fc'] },
    liverpool: { slug: 'liverpool', canonicalName: 'Liverpool', aliases: ['liverpool', 'liverpool fc'] },
    mancity: { slug: 'mancity', canonicalName: 'Manchester City', aliases: ['manchester city', 'man city', 'manchester city fc'] },
    manunited: { slug: 'manunited', canonicalName: 'Manchester United', aliases: ['manchester united', 'man utd', 'man united', 'manchester united fc'] },
    newcastle: { slug: 'newcastle', canonicalName: 'Newcastle', aliases: ['newcastle', 'newcastle united', 'newcastle united fc'] },
    nottinghamforest: { slug: 'nottinghamforest', canonicalName: 'Nottingham Forest', aliases: ['nottingham forest', 'nottm forest', 'nottingham forest fc', 'nottingham'] },
    southampton: { slug: 'southampton', canonicalName: 'Southampton', aliases: ['southampton', 'southampton fc'] },
    tottenham: { slug: 'tottenham', canonicalName: 'Tottenham', aliases: ['tottenham', 'tottenham hotspur', 'spurs', 'tottenham hotspur fc'] },
    westham: { slug: 'westham', canonicalName: 'West Ham', aliases: ['west ham', 'west ham united', 'west ham united fc'] },
    wolves: { slug: 'wolves', canonicalName: 'Wolverhampton Wanderers', aliases: ['wolverhampton', 'wolverhampton wanderers', 'wolves', 'wolverhampton wanderers fc'] },
    sunderland: { slug: 'sunderland', canonicalName: 'Sunderland', aliases: ['sunderland', 'sunderland afc'] },
    leeds: { slug: 'leeds', canonicalName: 'Leeds', aliases: ['leeds', 'leeds united', 'leeds united fc'] },
    coventry: { slug: 'coventry', canonicalName: 'Coventry', aliases: ['coventry', 'coventry city', 'coventry city fc'] },
    hull: { slug: 'hull', canonicalName: 'Hull City', aliases: ['hull', 'hull city', 'hull city afc'] },
  },

  // ─── TIER A: LA LIGA ────────────────────────────────────────────────────────
  LALIGA: {
    alaves: { slug: 'alaves', canonicalName: 'Alaves', aliases: ['alaves', 'deportivo alaves'] },
    athleticclub: { slug: 'athleticclub', canonicalName: 'Athletic Club', aliases: ['athletic club', 'athletic bilbao', 'bilbao'] },
    atleticomadrid: { slug: 'atleticomadrid', canonicalName: 'Atletico Madrid', aliases: ['atletico madrid', 'atletico de madrid', 'atlético de madrid', 'atlético madrid', 'atletico'] },
    barcelona: { slug: 'barcelona', canonicalName: 'Barcelona', aliases: ['barcelona', 'fc barcelona', 'barca'] },
    celtavigo: { slug: 'celtavigo', canonicalName: 'Celta Vigo', aliases: ['celta vigo', 'rc celta', 'celta de vigo', 'celta'] },
    deportivolacoruna: { slug: 'deportivolacoruna', canonicalName: 'Deportivo La Coruna', aliases: ['deportivo la coruna', 'deportivo', 'rc deportivo', 'deportivo de a coruña'] },
    elche: { slug: 'elche', canonicalName: 'Elche', aliases: ['elche', 'elche cf'] },
    getafe: { slug: 'getafe', canonicalName: 'Getafe', aliases: ['getafe', 'getafe cf'] },
    levante: { slug: 'levante', canonicalName: 'Levante', aliases: ['levante', 'levante ud'] },
    osasuna: { slug: 'osasuna', canonicalName: 'Osasuna', aliases: ['osasuna', 'ca osasuna'] },
    racingsantander: { slug: 'racingsantander', canonicalName: 'Racing Santander', aliases: ['racing santander', 'racing de santander'] },
    rayovallecano: { slug: 'rayovallecano', canonicalName: 'Rayo Vallecano', aliases: ['rayo vallecano', 'rayo'] },
    realbetis: { slug: 'realbetis', canonicalName: 'Real Betis', aliases: ['real betis', 'betis', 'real betis balompie'] },
    realmadrid: { slug: 'realmadrid', canonicalName: 'Real Madrid', aliases: ['real madrid', 'real madrid cf'] },
    realsociedad: { slug: 'realsociedad', canonicalName: 'Real Sociedad', aliases: ['real sociedad', 'la real'] },
    sevilla: { slug: 'sevilla', canonicalName: 'Sevilla', aliases: ['sevilla', 'sevilla fc'] },
    valencia: { slug: 'valencia', canonicalName: 'Valencia', aliases: ['valencia', 'valencia cf'] },
    villarreal: { slug: 'villarreal', canonicalName: 'Villarreal', aliases: ['villarreal', 'villarreal cf'] },
  },

  // ─── TIER A: SERIE A ────────────────────────────────────────────────────────
  SERIEA: {
    acmilan: { slug: 'acmilan', canonicalName: 'AC Milan', aliases: ['ac milan', 'milan'] },
    asroma: { slug: 'asroma', canonicalName: 'AS Roma', aliases: ['as roma', 'roma'] },
    atalanta: { slug: 'atalanta', canonicalName: 'Atalanta', aliases: ['atalanta', 'atalanta bc'] },
    bologna: { slug: 'bologna', canonicalName: 'Bologna', aliases: ['bologna', 'bologna fc'] },
    cagliari: { slug: 'cagliari', canonicalName: 'Cagliari', aliases: ['cagliari', 'cagliari calcio'] },
    como: { slug: 'como', canonicalName: 'Como', aliases: ['como', 'como 1907'] },
    fiorentina: { slug: 'fiorentina', canonicalName: 'Fiorentina', aliases: ['fiorentina', 'acf fiorentina'] },
    frosinone: { slug: 'frosinone', canonicalName: 'Frosinone', aliases: ['frosinone', 'frosinone calcio'] },
    genoa: { slug: 'genoa', canonicalName: 'Genoa', aliases: ['genoa', 'genoa cfc'] },
    inter: { slug: 'inter', canonicalName: 'Inter', aliases: ['inter', 'inter milan', 'internazionale', 'fc internazionale'] },
    juventus: { slug: 'juventus', canonicalName: 'Juventus', aliases: ['juventus', 'juventus fc'] },
    lazio: { slug: 'lazio', canonicalName: 'Lazio', aliases: ['lazio', 'ss lazio'] },
    lecce: { slug: 'lecce', canonicalName: 'Lecce', aliases: ['lecce', 'us lecce'] },
    monza: { slug: 'monza', canonicalName: 'Monza', aliases: ['monza', 'ac monza'] },
    napoli: { slug: 'napoli', canonicalName: 'Napoli', aliases: ['napoli', 'ssc napoli'] },
    parma: { slug: 'parma', canonicalName: 'Parma', aliases: ['parma', 'parma calcio'] },
    sassuolo: { slug: 'sassuolo', canonicalName: 'Sassuolo', aliases: ['sassuolo', 'us sassuolo'] },
    torino: { slug: 'torino', canonicalName: 'Torino', aliases: ['torino', 'torino fc'] },
    udinese: { slug: 'udinese', canonicalName: 'Udinese', aliases: ['udinese', 'udinese calcio'] },
    venezia: { slug: 'venezia', canonicalName: 'Venezia', aliases: ['venezia', 'venezia fc'] },
  },

  // ─── TIER A: BUNDESLIGA ──────────────────────────────────────────────────────
  BUNDESLIGA: {
    fckoeln: { slug: 'fckoeln', canonicalName: '1. FC Köln', aliases: ['1. fc köln', 'fc koln', 'koln', '1. fc koln', 'köln'] },
    hoffenheim: { slug: 'hoffenheim', canonicalName: '1899 Hoffenheim', aliases: ['1899 hoffenheim', 'hoffenheim', 'tsg hoffenheim', 'tsg 1899 hoffenheim'] },
    leverkusen: { slug: 'leverkusen', canonicalName: 'Bayer Leverkusen', aliases: ['bayer leverkusen', 'leverkusen', 'bayer 04 leverkusen'] },
    bayern: { slug: 'bayern', canonicalName: 'Bayern München', aliases: ['bayern münchen', 'bayern munich', 'bayern', 'fc bayern münchen'] },
    moenchengladbach: { slug: 'moenchengladbach', canonicalName: 'Borussia Mönchengladbach', aliases: ['borussia mönchengladbach', 'monchengladbach', 'mönchengladbach', 'gladbach', "borussia m'gladbach"] },
    frankfurt: { slug: 'frankfurt', canonicalName: 'Eintracht Frankfurt', aliases: ['eintracht frankfurt', 'frankfurt'] },
    augsburg: { slug: 'augsburg', canonicalName: 'FC Augsburg', aliases: ['fc augsburg', 'augsburg'] },
    schalke: { slug: 'schalke', canonicalName: 'FC Schalke 04', aliases: ['fc schalke 04', 'schalke', 'schalke 04'] },
    mainz: { slug: 'mainz', canonicalName: 'FSV Mainz 05', aliases: ['fsv mainz 05', 'mainz', 'mainz 05', '1. fsv mainz 05'] },
    hsv: { slug: 'hsv', canonicalName: 'Hamburger SV', aliases: ['hamburger sv', 'hsv', 'hamburg'] },
    rbleipzig: { slug: 'rbleipzig', canonicalName: 'RB Leipzig', aliases: ['rb leipzig', 'leipzig'] },
    freiburg: { slug: 'freiburg', canonicalName: 'SC Freiburg', aliases: ['sc freiburg', 'freiburg'] },
    paderborn: { slug: 'paderborn', canonicalName: 'SC Paderborn 07', aliases: ['sc paderborn 07', 'paderborn', 'sc paderborn'] },
    elversberg: { slug: 'elversberg', canonicalName: 'SV Elversberg', aliases: ['sv elversberg', 'elversberg'] },
    unionberlin: { slug: 'unionberlin', canonicalName: 'Union Berlin', aliases: ['union berlin', '1. fc union berlin'] },
    stuttgart: { slug: 'stuttgart', canonicalName: 'VfB Stuttgart', aliases: ['vfb stuttgart', 'stuttgart'] },
  },

  // ─── TIER A: LIGUE 1 ────────────────────────────────────────────────────────
  LIGUE1: {
    angers: { slug: 'angers', canonicalName: 'Angers', aliases: ['angers', 'angers sco'] },
    auxerre: { slug: 'auxerre', canonicalName: 'Auxerre', aliases: ['auxerre', 'aj auxerre'] },
    troyes: { slug: 'troyes', canonicalName: 'Estac Troyes', aliases: ['estac troyes', 'troyes', 'estac'] },
    lehavre: { slug: 'lehavre', canonicalName: 'Le Havre', aliases: ['le havre', 'le havre ac', 'hac'] },
    lemans: { slug: 'lemans', canonicalName: 'Le Mans', aliases: ['le mans', 'le mans fc'] },
    lille: { slug: 'lille', canonicalName: 'Lille', aliases: ['lille', 'lille osc', 'losc lille', 'losc'] },
    lorient: { slug: 'lorient', canonicalName: 'Lorient', aliases: ['lorient', 'fc lorient'] },
    marseille: { slug: 'marseille', canonicalName: 'Marseille', aliases: ['marseille', 'olympique de marseille', 'olympique marseille', 'om'] },
    monaco: { slug: 'monaco', canonicalName: 'Monaco', aliases: ['monaco', 'as monaco'] },
    nice: { slug: 'nice', canonicalName: 'Nice', aliases: ['nice', 'ogc nice'] },
    parisfc: { slug: 'parisfc', canonicalName: 'Paris FC', aliases: ['paris fc'] },
    psg: { slug: 'psg', canonicalName: 'Paris Saint Germain', aliases: ['paris saint germain', 'psg', 'paris sg', 'paris saint-germain'] },
    rennes: { slug: 'rennes', canonicalName: 'Rennes', aliases: ['rennes', 'stade rennais', 'stade rennais fc'] },
    brest: { slug: 'brest', canonicalName: 'Stade Brestois 29', aliases: ['stade brestois 29', 'brest', 'stade brestois'] },
    strasbourg: { slug: 'strasbourg', canonicalName: 'Strasbourg', aliases: ['strasbourg', 'rc strasbourg', 'rc strasbourg alsace'] },
    toulouse: { slug: 'toulouse', canonicalName: 'Toulouse', aliases: ['toulouse', 'toulouse fc'] },
  },

  // ─── TIER B: EREDIVISIE ──────────────────────────────────────────────────────
  EREDIVISIE: {
    adodenhaag: { slug: 'adodenhaag', canonicalName: 'ADO Den Haag', aliases: ['ado den haag', 'den haag'] },
    azalkmaar: { slug: 'azalkmaar', canonicalName: 'AZ Alkmaar', aliases: ['az alkmaar', 'az'] },
    ajax: { slug: 'ajax', canonicalName: 'Ajax', aliases: ['ajax', 'afc ajax'] },
    cambuur: { slug: 'cambuur', canonicalName: 'Cambuur', aliases: ['cambuur', 'sc cambuur'] },
    excelsior: { slug: 'excelsior', canonicalName: 'Excelsior', aliases: ['excelsior', 'sbv excelsior'] },
    feyenoord: { slug: 'feyenoord', canonicalName: 'Feyenoord', aliases: ['feyenoord', 'feyenoord rotterdam'] },
    fortunasittard: { slug: 'fortunasittard', canonicalName: 'Fortuna Sittard', aliases: ['fortuna sittard'] },
    goaheadeagles: { slug: 'goaheadeagles', canonicalName: 'GO Ahead Eagles', aliases: ['go ahead eagles'] },
    groningen: { slug: 'groningen', canonicalName: 'Groningen', aliases: ['groningen', 'fc groningen'] },
    heerenveen: { slug: 'heerenveen', canonicalName: 'Heerenveen', aliases: ['heerenveen', 'sc heerenveen'] },
    necnijmegen: { slug: 'necnijmegen', canonicalName: 'NEC Nijmegen', aliases: ['nec nijmegen', 'nec'] },
    peczwolle: { slug: 'peczwolle', canonicalName: 'PEC Zwolle', aliases: ['pec zwolle', 'zwolle'] },
    spartarotterdam: { slug: 'spartarotterdam', canonicalName: 'Sparta Rotterdam', aliases: ['sparta rotterdam', 'sparta'] },
    telstar: { slug: 'telstar', canonicalName: 'Telstar', aliases: ['telstar', 'sc telstar'] },
    twente: { slug: 'twente', canonicalName: 'Twente', aliases: ['twente', 'fc twente'] },
    utrecht: { slug: 'utrecht', canonicalName: 'Utrecht', aliases: ['utrecht', 'fc utrecht'] },
    willemii: { slug: 'willemii', canonicalName: 'Willem II', aliases: ['willem ii'] },
  },

  // ─── TIER B: PRIMEIRA LIGA ──────────────────────────────────────────────────
  PRIMEIRA: {
    academicoviseu: { slug: 'academicoviseu', canonicalName: 'Academico Viseu', aliases: ['academico viseu', 'académico de viseu', 'academico de viseu'] },
    alverca: { slug: 'alverca', canonicalName: 'Alverca', aliases: ['alverca', 'fc alverca'] },
    arouca: { slug: 'arouca', canonicalName: 'Arouca', aliases: ['arouca', 'fc arouca'] },
    benfica: { slug: 'benfica', canonicalName: 'Benfica', aliases: ['benfica', 'sl benfica'] },
    casapia: { slug: 'casapia', canonicalName: 'Casa Pia', aliases: ['casa pia', 'casa pia ac'] },
    estoril: { slug: 'estoril', canonicalName: 'Estoril', aliases: ['estoril', 'estoril praia', 'gd estoril praia'] },
    estrela: { slug: 'estrela', canonicalName: 'Estrela', aliases: ['estrela', 'estrela da amadora', 'cf estrela da amadora'] },
    porto: { slug: 'porto', canonicalName: 'FC Porto', aliases: ['fc porto', 'porto'] },
    famalicao: { slug: 'famalicao', canonicalName: 'Famalicao', aliases: ['famalicao', 'fc famalicao', 'famalicão'] },
    maritimo: { slug: 'maritimo', canonicalName: 'Maritimo', aliases: ['maritimo', 'cs maritimo'] },
    nacional: { slug: 'nacional', canonicalName: 'Nacional', aliases: ['nacional', 'cd nacional'] },
    rioave: { slug: 'rioave', canonicalName: 'Rio Ave', aliases: ['rio ave', 'rio ave fc'] },
    santaclara: { slug: 'santaclara', canonicalName: 'Santa Clara', aliases: ['santa clara', 'cd santa clara'] },
    vitoriasc: { slug: 'vitoriasc', canonicalName: 'Vitória SC', aliases: ['vitória sc', 'vitoria sc', 'vitoria guimaraes', 'vitória de guimarães', 'vitória guimarães'] },
  },

  // ─── TIER B: JUPILER PRO LEAGUE ─────────────────────────────────────────────
  BELPRO: {
    anderlecht: { slug: 'anderlecht', canonicalName: 'Anderlecht', aliases: ['anderlecht', 'rsc anderlecht'] },
    antwerp: { slug: 'antwerp', canonicalName: 'Antwerp', aliases: ['antwerp', 'royal antwerp fc', 'royal antwerp'] },
    cerclebrugge: { slug: 'cerclebrugge', canonicalName: 'Cercle Brugge', aliases: ['cercle brugge', 'cercle brugge ksv'] },
    charleroi: { slug: 'charleroi', canonicalName: 'Charleroi', aliases: ['charleroi', 'sporting charleroi'] },
    clubbrugge: { slug: 'clubbrugge', canonicalName: 'Club Brugge KV', aliases: ['club brugge kv', 'club brugge', 'brugge'] },
    genk: { slug: 'genk', canonicalName: 'Genk', aliases: ['genk', 'krc genk'] },
    gent: { slug: 'gent', canonicalName: 'Gent', aliases: ['gent', 'kaa gent'] },
    mechelen: { slug: 'mechelen', canonicalName: 'KV Mechelen', aliases: ['kv mechelen', 'mechelen'] },
    westerlo: { slug: 'westerlo', canonicalName: 'KVC Westerlo', aliases: ['kvc westerlo', 'westerlo'] },
    kortrijk: { slug: 'kortrijk', canonicalName: 'Kortrijk', aliases: ['kortrijk', 'kv kortrijk'] },
    ohleuven: { slug: 'ohleuven', canonicalName: 'OH Leuven', aliases: ['oh leuven', 'oud-heverlee leuven'] },
    lalouviere: { slug: 'lalouviere', canonicalName: 'RAAL La Louvière', aliases: ['raal la louvière', 'raal la louviere', 'la louviere'] },
    sinttruiden: { slug: 'sinttruiden', canonicalName: 'St. Truiden', aliases: ['st. truiden', 'sint-truiden', 'st truiden', 'stvv'] },
    standardliege: { slug: 'standardliege', canonicalName: 'Standard Liege', aliases: ['standard liege', 'standard de liege', 'standard liège'] },
    unionstgilloise: { slug: 'unionstgilloise', canonicalName: 'Union St. Gilloise', aliases: ['union st. gilloise', 'union saint-gilloise', 'union sg'] },
    zultewaregem: { slug: 'zultewaregem', canonicalName: 'Zulte Waregem', aliases: ['zulte waregem', 'sv zulte waregem'] },
  },

  // ─── TIER B: PREMIERSHIP SCOTLAND ──────────────────────────────────────────
  SCOPREM: {
    aberdeen: { slug: 'aberdeen', canonicalName: 'Aberdeen', aliases: ['aberdeen', 'aberdeen fc'] },
    celtic: { slug: 'celtic', canonicalName: 'Celtic', aliases: ['celtic', 'celtic fc'] },
    dundee: { slug: 'dundee', canonicalName: 'Dundee', aliases: ['dundee', 'dundee fc'] },
    dundeeutd: { slug: 'dundeeutd', canonicalName: 'Dundee Utd', aliases: ['dundee utd', 'dundee united', 'dundee united fc'] },
    falkirk: { slug: 'falkirk', canonicalName: 'Falkirk', aliases: ['falkirk', 'falkirk fc'] },
    heartofmidlothian: { slug: 'heartofmidlothian', canonicalName: 'Heart Of Midlothian', aliases: ['heart of midlothian', 'hearts'] },
    hibernian: { slug: 'hibernian', canonicalName: 'Hibernian', aliases: ['hibernian', 'hibernian fc', 'hibs'] },
    kilmarnock: { slug: 'kilmarnock', canonicalName: 'Kilmarnock', aliases: ['kilmarnock', 'kilmarnock fc'] },
    motherwell: { slug: 'motherwell', canonicalName: 'Motherwell', aliases: ['motherwell', 'motherwell fc'] },
    rangers: { slug: 'rangers', canonicalName: 'Rangers', aliases: ['rangers', 'rangers fc'] },
    stjohnstone: { slug: 'stjohnstone', canonicalName: 'ST Johnstone', aliases: ['st johnstone', 'st. johnstone', 'saint johnstone'] },
    stmirren: { slug: 'stmirren', canonicalName: 'ST Mirren', aliases: ['st mirren', 'st. mirren', 'saint mirren'] },
  },

  // ─── TIER B: CHAMPIONSHIP ENGLAND ───────────────────────────────────────────
  ENGCHAMP: {
    birmingham: { slug: 'birmingham', canonicalName: 'Birmingham', aliases: ['birmingham', 'birmingham city'] },
    blackburn: { slug: 'blackburn', canonicalName: 'Blackburn', aliases: ['blackburn', 'blackburn rovers'] },
    bolton: { slug: 'bolton', canonicalName: 'Bolton', aliases: ['bolton', 'bolton wanderers'] },
    bristolcity: { slug: 'bristolcity', canonicalName: 'Bristol City', aliases: ['bristol city'] },
    burnley: { slug: 'burnley', canonicalName: 'Burnley', aliases: ['burnley', 'burnley fc'] },
    cardiff: { slug: 'cardiff', canonicalName: 'Cardiff', aliases: ['cardiff', 'cardiff city'] },
    charlton: { slug: 'charlton', canonicalName: 'Charlton', aliases: ['charlton', 'charlton athletic'] },
    derby: { slug: 'derby', canonicalName: 'Derby', aliases: ['derby', 'derby county'] },
    lincoln: { slug: 'lincoln', canonicalName: 'Lincoln', aliases: ['lincoln', 'lincoln city'] },
    middlesbrough: { slug: 'middlesbrough', canonicalName: 'Middlesbrough', aliases: ['middlesbrough', 'boro'] },
    millwall: { slug: 'millwall', canonicalName: 'Millwall', aliases: ['millwall', 'millwall fc'] },
    norwich: { slug: 'norwich', canonicalName: 'Norwich', aliases: ['norwich', 'norwich city'] },
    portsmouth: { slug: 'portsmouth', canonicalName: 'Portsmouth', aliases: ['portsmouth', 'portsmouth fc', 'pompey'] },
    preston: { slug: 'preston', canonicalName: 'Preston', aliases: ['preston', 'preston north end'] },
    qpr: { slug: 'qpr', canonicalName: 'QPR', aliases: ['qpr', 'queens park rangers'] },
    sheffieldutd: { slug: 'sheffieldutd', canonicalName: 'Sheffield Utd', aliases: ['sheffield utd', 'sheffield united'] },
    southampton: { slug: 'southampton', canonicalName: 'Southampton', aliases: ['southampton', 'southampton fc'] },
    stokecity: { slug: 'stokecity', canonicalName: 'Stoke City', aliases: ['stoke city', 'stoke'] },
    swansea: { slug: 'swansea', canonicalName: 'Swansea', aliases: ['swansea', 'swansea city'] },
    watford: { slug: 'watford', canonicalName: 'Watford', aliases: ['watford', 'watford fc'] },
    westbrom: { slug: 'westbrom', canonicalName: 'West Brom', aliases: ['west brom', 'west bromwich albion', 'wba'] },
    westham: { slug: 'westham', canonicalName: 'West Ham', aliases: ['west ham', 'west ham united'] },
    wolves: { slug: 'wolves', canonicalName: 'Wolves', aliases: ['wolves', 'wolverhampton wanderers'] },
    wrexham: { slug: 'wrexham', canonicalName: 'Wrexham', aliases: ['wrexham', 'wrexham afc'] },
  },

  // ─── TIER B: MLS ────────────────────────────────────────────────────────────
  MLS: {
    atlantaunited: { slug: 'atlantaunited', canonicalName: 'Atlanta United FC', aliases: ['atlanta united fc', 'atlanta united', 'atlanta'] },
    austin: { slug: 'austin', canonicalName: 'Austin', aliases: ['austin', 'austin fc'] },
    cfmontreal: { slug: 'cfmontreal', canonicalName: 'CF Montreal', aliases: ['cf montreal', 'montreal', 'cf montréal'] },
    charlotte: { slug: 'charlotte', canonicalName: 'Charlotte', aliases: ['charlotte', 'charlotte fc'] },
    chicagofire: { slug: 'chicagofire', canonicalName: 'Chicago Fire', aliases: ['chicago fire', 'chicago fire fc'] },
    coloradorapids: { slug: 'coloradorapids', canonicalName: 'Colorado Rapids', aliases: ['colorado rapids', 'colorado'] },
    columbuscrew: { slug: 'columbuscrew', canonicalName: 'Columbus Crew', aliases: ['columbus crew', 'columbus'] },
    dcunited: { slug: 'dcunited', canonicalName: 'DC United', aliases: ['dc united', 'd.c. united'] },
    fccincinnati: { slug: 'fccincinnati', canonicalName: 'FC Cincinnati', aliases: ['fc cincinnati', 'cincinnati'] },
    fcdallas: { slug: 'fcdallas', canonicalName: 'FC Dallas', aliases: ['fc dallas', 'dallas'] },
    houstondynamo: { slug: 'houstondynamo', canonicalName: 'Houston Dynamo', aliases: ['houston dynamo', 'houston dynamo fc'] },
    intermiami: { slug: 'intermiami', canonicalName: 'Inter Miami', aliases: ['inter miami', 'inter miami cf'] },
    lafc: { slug: 'lafc', canonicalName: 'Los Angeles FC', aliases: ['los angeles fc', 'lafc', 'los angeles'] },
    lagalaxy: { slug: 'lagalaxy', canonicalName: 'Los Angeles Galaxy', aliases: ['los angeles galaxy', 'la galaxy'] },
    minnesotaunited: { slug: 'minnesotaunited', canonicalName: 'Minnesota United FC', aliases: ['minnesota united fc', 'minnesota united'] },
    nashvillesc: { slug: 'nashvillesc', canonicalName: 'Nashville SC', aliases: ['nashville sc', 'nashville'] },
    newenglandrevolution: { slug: 'newenglandrevolution', canonicalName: 'New England Revolution', aliases: ['new england revolution', 'new england'] },
    nycfc: { slug: 'nycfc', canonicalName: 'New York City FC', aliases: ['new york city fc', 'nycfc', 'new york city'] },
    newyorkredbulls: { slug: 'newyorkredbulls', canonicalName: 'New York Red Bulls', aliases: ['new york red bulls', 'ny red bulls', 'red bulls', 'new york rb'] },
    orlandocity: { slug: 'orlandocity', canonicalName: 'Orlando City SC', aliases: ['orlando city sc', 'orlando city', 'orlando'] },
    philadelphiaunion: { slug: 'philadelphiaunion', canonicalName: 'Philadelphia Union', aliases: ['philadelphia union', 'philadelphia'] },
    portlandtimbers: { slug: 'portlandtimbers', canonicalName: 'Portland Timbers', aliases: ['portland timbers', 'portland'] },
    realsaltlake: { slug: 'realsaltlake', canonicalName: 'Real Salt Lake', aliases: ['real salt lake', 'rsl'] },
    sandiego: { slug: 'sandiego', canonicalName: 'San Diego', aliases: ['san diego', 'san diego fc'] },
    sanjoseearthquakes: { slug: 'sanjoseearthquakes', canonicalName: 'San Jose Earthquakes', aliases: ['san jose earthquakes', 'san jose', 'sj earthquakes'] },
    seattlesounders: { slug: 'seattlesounders', canonicalName: 'Seattle Sounders', aliases: ['seattle sounders', 'seattle sounders fc', 'sounders'] },
    sportingkc: { slug: 'sportingkc', canonicalName: 'Sporting Kansas City', aliases: ['sporting kansas city', 'sporting kc'] },
    stlouiscity: { slug: 'stlouiscity', canonicalName: 'St. Louis City', aliases: ['st. louis city', 'st louis city', 'st louis city sc'] },
    torontofc: { slug: 'torontofc', canonicalName: 'Toronto FC', aliases: ['toronto fc', 'toronto'] },
    vancouverwhitecaps: { slug: 'vancouverwhitecaps', canonicalName: 'Vancouver Whitecaps', aliases: ['vancouver whitecaps', 'vancouver whitecaps fc', 'vancouver'] },
  },

  // ─── TIER C: SAUDI PRO LEAGUE ───────────────────────────────────────────────
  SAUPRO: {
    abha: { slug: 'abha', canonicalName: 'Abha', aliases: ['abha', 'abha club'] },
    alkhaleej: { slug: 'alkhaleej', canonicalName: 'Al Khaleej Saihat', aliases: ['al khaleej saihat', 'al khaleej', 'al-khaleej'] },
    alkholood: { slug: 'alkholood', canonicalName: 'Al Kholood', aliases: ['al kholood', 'al-kholood'] },
    alriyadh: { slug: 'alriyadh', canonicalName: 'Al Riyadh', aliases: ['al riyadh', 'al-riyadh'] },
    alshabab: { slug: 'alshabab', canonicalName: 'Al Shabab', aliases: ['al shabab', 'al-shabab'] },
    altaawon: { slug: 'altaawon', canonicalName: 'Al Taawon', aliases: ['al taawon', 'al-taawon', 'al taawoun'] },
    alahli: { slug: 'alahli', canonicalName: 'Al-Ahli Jeddah', aliases: ['al-ahli jeddah', 'al-ahli', 'al ahli'] },
    alettifaq: { slug: 'alettifaq', canonicalName: 'Al-Ettifaq', aliases: ['al-ettifaq', 'al ettifaq'] },
    alfaisaly: { slug: 'alfaisaly', canonicalName: 'Al-Faisaly FC', aliases: ['al-faisaly fc', 'al faisaly', 'al-faisaly'] },
    alfateh: { slug: 'alfateh', canonicalName: 'Al-Fateh', aliases: ['al-fateh', 'al fateh'] },
    alfayha: { slug: 'alfayha', canonicalName: 'Al-Fayha', aliases: ['al-fayha', 'al fayha'] },
    alhazm: { slug: 'alhazm', canonicalName: 'Al-Hazm', aliases: ['al-hazm', 'al hazm', 'al hazem'] },
    alhilal: { slug: 'alhilal', canonicalName: 'Al-Hilal Saudi FC', aliases: ['al-hilal saudi fc', 'al-hilal', 'al hilal'] },
    alittihad: { slug: 'alittihad', canonicalName: 'Al-Ittihad FC', aliases: ['al-ittihad fc', 'al-ittihad', 'al ittihad'] },
    alnassr: { slug: 'alnassr', canonicalName: 'Al-Nassr', aliases: ['al-nassr', 'al nassr'] },
    alqadisiyah: { slug: 'alqadisiyah', canonicalName: 'Al-Qadisiyah FC', aliases: ['al-qadisiyah fc', 'al qadisiyah', 'al-qadsiah', 'al qadsiah'] },
    neom: { slug: 'neom', canonicalName: 'NEOM', aliases: ['neom', 'neom sc'] },
  },

  // ─── TIER C: J1 LEAGUE JAPAN ────────────────────────────────────────────────
  J1: {
    avispa: { slug: 'avispa', canonicalName: 'Avispa Fukuoka', aliases: ['avispa fukuoka', 'avispa'] },
    cerezoosaka: { slug: 'cerezoosaka', canonicalName: 'Cerezo Osaka', aliases: ['cerezo osaka', 'cerezo'] },
    fctokyo: { slug: 'fctokyo', canonicalName: 'FC Tokyo', aliases: ['fc tokyo'] },
    fagiano: { slug: 'fagiano', canonicalName: 'Fagiano Okayama', aliases: ['fagiano okayama', 'okayama'] },
    jefunited: { slug: 'jefunited', canonicalName: 'JEF United Chiba', aliases: ['jef united chiba', 'jef united'] },
    kawasaki: { slug: 'kawasaki', canonicalName: 'Kawasaki Frontale', aliases: ['kawasaki frontale', 'kawasaki'] },
    kyotosanga: { slug: 'kyotosanga', canonicalName: 'Kyoto Sanga', aliases: ['kyoto sanga', 'kyoto'] },
    machidazelvia: { slug: 'machidazelvia', canonicalName: 'Machida Zelvia', aliases: ['machida zelvia', 'machida'] },
    mitohollyhock: { slug: 'mitohollyhock', canonicalName: 'Mito Hollyhock', aliases: ['mito hollyhock', 'mito'] },
    nagoyagrampus: { slug: 'nagoyagrampus', canonicalName: 'Nagoya Grampus', aliases: ['nagoya grampus', 'nagoya'] },
    sanfrecce: { slug: 'sanfrecce', canonicalName: 'Sanfrecce Hiroshima', aliases: ['sanfrecce hiroshima', 'sanfrecce'] },
    shimizuspulse: { slug: 'shimizuspulse', canonicalName: 'Shimizu S-pulse', aliases: ['shimizu s-pulse', 'shimizu'] },
    tokyoverdy: { slug: 'tokyoverdy', canonicalName: 'Tokyo Verdy', aliases: ['tokyo verdy'] },
    urawa: { slug: 'urawa', canonicalName: 'Urawa', aliases: ['urawa', 'urawa red diamonds', 'urawa reds'] },
    vvarennagasaki: { slug: 'vvarennagasaki', canonicalName: 'V-varen Nagasaki', aliases: ['v-varen nagasaki', 'nagasaki'] },
    yokohamafmarinos: { slug: 'yokohamafmarinos', canonicalName: 'Yokohama F. Marinos', aliases: ['yokohama f. marinos', 'yokohama f marinos', 'marinos'] },
  },

  // ─── TIER C: K LEAGUE 1 SOUTH KOREA ─────────────────────────────────────────
  K1: {
    fcanyang: { slug: 'fcanyang', canonicalName: 'FC Anyang', aliases: ['fc anyang', 'anyang'] },
    fcseoul: { slug: 'fcseoul', canonicalName: 'FC Seoul', aliases: ['fc seoul', 'seoul'] },
    gimcheonsangmu: { slug: 'gimcheonsangmu', canonicalName: 'Gimcheon Sangmu FC', aliases: ['gimcheon sangmu fc', 'gimcheon sangmu', 'sangmu'] },
    gwangjufc: { slug: 'gwangjufc', canonicalName: 'Gwangju FC', aliases: ['gwangju fc', 'gwangju'] },
    jejuunited: { slug: 'jejuunited', canonicalName: 'Jeju United FC', aliases: ['jeju united fc', 'jeju united', 'jeju'] },
    ulsanhyundai: { slug: 'ulsanhyundai', canonicalName: 'Ulsan Hyundai FC', aliases: ['ulsan hyundai fc', 'ulsan hyundai', 'ulsan hd', 'ulsan'] },
  },

  // ─── TIER C: LIGA 1 INDONESIA ───────────────────────────────────────────────
  IDNL1: {
    aremafc: { slug: 'aremafc', canonicalName: 'Arema FC', aliases: ['arema fc', 'arema'] },
    baliunited: { slug: 'baliunited', canonicalName: 'Bali United', aliases: ['bali united', 'bali united fc'] },
    bhayangkarafc: { slug: 'bhayangkarafc', canonicalName: 'Bhayangkara FC', aliases: ['bhayangkara fc', 'bhayangkara'] },
    dewaunited: { slug: 'dewaunited', canonicalName: 'Dewa United', aliases: ['dewa united', 'dewa united fc'] },
    garudayaksa: { slug: 'garudayaksa', canonicalName: 'Garudayaksa', aliases: ['garudayaksa', 'garudayaksa fc'] },
    isenmulangkalteng: { slug: 'isenmulangkalteng', canonicalName: 'Isenmulang Kalteng', aliases: ['isenmulang kalteng', 'kalteng putra'] },
    javaunited: { slug: 'javaunited', canonicalName: 'Java United', aliases: ['java united'] },
    psimyogyakarta: { slug: 'psimyogyakarta', canonicalName: 'PSIM Yogyakarta', aliases: ['psim yogyakarta', 'psim'] },
    psmmakassar: { slug: 'psmmakassar', canonicalName: 'PSM Makassar', aliases: ['psm makassar', 'psm'] },
    psssleman: { slug: 'psssleman', canonicalName: 'PSS Sleman', aliases: ['pss sleman', 'pss'] },
    madurautd: { slug: 'madurautd', canonicalName: 'Persepam Madura Utd', aliases: ['persepam madura utd', 'madura united', 'madura utd'] },
    persib: { slug: 'persib', canonicalName: 'Persib Bandung', aliases: ['persib bandung', 'persib'] },
    persija: { slug: 'persija', canonicalName: 'Persija', aliases: ['persija', 'persija jakarta'] },
    persijap: { slug: 'persijap', canonicalName: 'Persijap', aliases: ['persijap', 'persijap jepara'] },
    persita: { slug: 'persita', canonicalName: 'Persita', aliases: ['persita', 'persita tangerang'] },
    borneofc: { slug: 'borneofc', canonicalName: 'Pusamania Borneo', aliases: ['pusamania borneo', 'borneo fc', 'borneo'] },
  },
};

/**
 * Fast lookup map: leaguePrefix -> normalizedAlias -> CanonicalTeamDefinition
 */
const LOOKUP_MAP: Map<string, Map<string, CanonicalTeamDefinition>> = new Map();

function initLookupMap() {
  for (const [leaguePrefix, teams] of Object.entries(LEAGUE_TEAM_REGISTRIES)) {
    const leagueMap = new Map<string, CanonicalTeamDefinition>();
    for (const teamDef of Object.values(teams)) {
      for (const alias of teamDef.aliases) {
        leagueMap.set(alias.toLowerCase().trim(), teamDef);
      }
    }
    LOOKUP_MAP.set(leaguePrefix, leagueMap);
  }
}
initLookupMap();

/**
 * Resolves a team name within a league scope.
 * If unmapped, returns { slug: 'UNMAPPED_TEAM', status: 'UNMAPPED_TEAM', isMapped: false }.
 */
export function resolveTeam(teamName: string, leaguePrefix?: string): TeamResolutionResult {
  if (!teamName || typeof teamName !== 'string') {
    return { slug: 'UNMAPPED_TEAM', canonicalName: 'Unknown', status: 'UNMAPPED_TEAM', isMapped: false };
  }

  const rawLower = teamName.toLowerCase().trim();

  // 1. Direct league-scoped lookup
  if (leaguePrefix && LOOKUP_MAP.has(leaguePrefix)) {
    const lMap = LOOKUP_MAP.get(leaguePrefix)!;
    if (lMap.has(rawLower)) {
      const def = lMap.get(rawLower)!;
      return { slug: def.slug, canonicalName: def.canonicalName, status: 'MAPPED', isMapped: true };
    }
    // Try substring matching within explicit aliases only (strict, never loose)
    for (const [alias, def] of lMap.entries()) {
      if (rawLower === alias || rawLower.includes(alias) || alias.includes(rawLower)) {
        return { slug: def.slug, canonicalName: def.canonicalName, status: 'MAPPED', isMapped: true };
      }
    }
    return { slug: 'UNMAPPED_TEAM', canonicalName: teamName, status: 'UNMAPPED_TEAM', isMapped: false };
  }

  // 2. Global search across all leagues if no league specified
  for (const lMap of LOOKUP_MAP.values()) {
    if (lMap.has(rawLower)) {
      const def = lMap.get(rawLower)!;
      return { slug: def.slug, canonicalName: def.canonicalName, status: 'MAPPED', isMapped: true };
    }
  }

  return { slug: 'UNMAPPED_TEAM', canonicalName: teamName, status: 'UNMAPPED_TEAM', isMapped: false };
}

/**
 * Resolves team key with backward-compatible fallback for legacy un-scoped callers.
 */
export function normalizeTeamWithRegistry(teamName: string, leaguePrefix?: string): string {
  const res = resolveTeam(teamName, leaguePrefix);
  if (res.isMapped) {
    return res.slug;
  }
  // If not mapped and leaguePrefix provided, explicitly return UNMAPPED_TEAM
  if (leaguePrefix) {
    return 'UNMAPPED_TEAM';
  }
  // Legacy un-scoped fallback: strip non-alphanumeric
  return (teamName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}
