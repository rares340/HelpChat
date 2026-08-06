/**
 * Selectează un set mic de tool-uri relevant pentru întrebare.
 *
 * De ce e nevoie: modelul de chat (qwen2.5:7b) se blochează sau răspunde slab
 * când primește toate cele 17 definiții de tool-uri odată — plafonul verificat
 * empiric este ~4 tool-uri. Selectăm după intenție (cuvinte-cheie normalizate),
 * cu plafon dur de 4.
 */

/** Normalizează: minuscule + fără diacritice (ș/ș, ț/ț, ă/â). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

interface IntentRule {
  pattern: RegExp;
  tools: string[];
}

/** Grup de facturi: înaintează întâi pe acțiune + obiect, apoi pe tipul de listă. */
const FACTURI_RULES: IntentRule[] = [
  {
    // "creează/adaugă/emite o factură", "fă o factură", "vreau o factură",
    // "factură nouă" → formular de factură. Excludem plățile ("adaugă o plată la
    // factura X" nu e creare de factură). Partenerul se pre-umple separat din
    // mesaj (forms.ts), deci add_partner nu mai face parte din această regulă.
    pattern: /(?:creeaz|adaug|emit|emis|fac\s+o|fa\s+o|fa\s+factur|vreau\s+factur)(?!.*plat).*factur|factur.*(nou|creat|emise?)/,
    tools: ['create_invoice'],
  },
  {
    // "adaugă/înregistrează o plată/încasare" → plăți + listele necesare
    pattern: /(adaug|inregistr|efectueaz).*(plat|incas)/,
    tools: ['register_payment', 'list_invoices_to_pay', 'list_invoices_to_collect'],
  },
  { pattern: /de platit|de plata|furnizor|plati|platesc/, tools: ['list_invoices_to_pay', 'list_overdue_invoices'] },
  { pattern: /de incasat|de incasare|client/, tools: ['list_invoices_to_collect', 'get_expected_collections'] },
  {
    // "balanță/sold/venituri vs cheltuieli/încasat/plătit"
    pattern: /balan|sold|venituri|cheltuieli|incasat|platit|numerar|cash/,
    tools: ['get_balance', 'get_statistics'],
  },
  { pattern: /anul|renunt|storn|cancel/, tools: ['cancel_invoice'] },
  { pattern: /statistic.*(factur|plati)/, tools: ['get_statistics'] },
];

// === Intenții despre parteneri ===
// Distingem crearea (formular), actualizarea (tool) și interogarea (fișă).
// O mențiune de "partener" NU înseamnă automat "partener nou": întrebările
// despre un partener existent trebuie să caute în baza de date (get_partner_statement).
const PARTNER_CREATE_RE =
  /\b(adaug|adauga|adaugi|creez|creeaza|inregistrez|inregistreaza|introduc|introdu)\s+(?:un\s+|un\s+nou\s+)?partener[a-z]*\b|partener[a-z]*\s+(?:nou|noua)\b|(?:firma|societate|client|furnizor)\b.*\b(?:ca|drept)\s+partener[a-z]*\b/;
const PARTNER_UPDATE_RE =
  /\b(actualizez|actualizeaza|modific|modifica|schimb|schimba|corectez|update)\b.{0,30}\bpartener[a-z]*\b|partener[a-z]*\b.*\b(actualiz|modif)\b/;
const PARTNER_QUERY_RE = /partener[a-z]*\b|firma|firmei|societate|client\b|furnizor\b/;

/** Tool-ul de partener potrivit intenției: creare, actualizare sau interogare. */
function selectPartnerTools(q: string): string[] {
  if (PARTNER_UPDATE_RE.test(q)) return ['update_partner'];
  if (PARTNER_CREATE_RE.test(q)) return ['add_partner'];
  if (PARTNER_QUERY_RE.test(q)) return ['get_partner_statement'];
  return [];
}

const STATS_RULES: IntentRule[] = [
  {
    pattern: /cate documente|statistici|activitate|erori|top|cel mai citat|procent indexat|folosit/,
    tools: ['get_document_stats', 'get_usage_stats', 'get_recent_errors', 'get_top_cited'],
  },
];

const HARD_CAP = 4;

/** Returnează numele tool-urilor de trimis modelului (max HARD_CAP). */
export function selectToolNames(question: string): string[] {
  const q = normalize(question);
  const chosen: string[] = [];
  const add = (names: string[]) => {
    for (const n of names) {
      if (!chosen.includes(n)) chosen.push(n);
    }
  };
  for (const rule of [...FACTURI_RULES, ...STATS_RULES]) {
    if (rule.pattern.test(q)) add(rule.tools);
  }
  add(selectPartnerTools(q));
  return chosen.slice(0, HARD_CAP);
}

/**
 * Distinge întrebările despre DATE din baza de date („ce facturi am de plătit?",
 * „cât am încasat?", „care e balanța?") de cele despre documente.
 *
 * De ce e nevoie: modelul de chat (qwen2.5:7b) nu apelează tool-urile când în
 * context există și fragmente RAG — alege RAG. Pentru întrebările de DB, chat.ts
 * suprimă fragmentele și trimite doar tool-uri, ca modelul să fie forțat să le
 * apeleze. Routarea e deterministă, înainte de model.
 *
 * Un cuvânt de date într-o întrebare explicativă („cum se calculează soldul?",
 * „ce înseamnă de încasat?") NU declanșează rutarea DB — rămâne pe RAG.
 */

/** Frame-uri explicative: chiar dacă apare un cuvânt de date, e o întrebare despre documente. */
const EXPLAIN_FRAME =
  /\bcum (fac|adaug|creez|emit|inregistrez|actualizez|calculez|pot|se|sa|as putea)\b|unde (gasesc|se afla|pun|aflu)\b|ce (inseamna|reprezinta|este|sunt)\b|explica(-?mi)?\b|vreau sa (stiu|vad|inteleg)\b/;

/** Expresii care indică clar o întrebare despre DATE din baza de date (nu despre documente). */
const DB_DATA_PATTERNS = [
  /de platit\b|de plata\b/, // „facturi de plătit / de plată"
  /de incasat\b|de incasare\b/, // „facturi de încasat / de încasare"
  /\brestante\b|\bscadente\b/, // „facturi restante / scadente"
  /\bincasat\b|\bplatit\b/, // „cât am încasat / plătit"
  /\bsold[a-z]*\b|\bbalant[a-z]*\b|\bflux[a-z]*\b/, // sold / balanță / flux (cu flexiuni)
  /incasari asteptate/, // încasări așteptate
  /\bultima luna\b|\bultimul an\b|\bluna trecuta\b|\bluna viitoare\b/, // perioadă
  /\bstatistici\b/, // statistici pe perioadă
  /cate documente|procent indexat|cel mai citat|top (documente|citate|citit)/, // stats index
  /\berori\b/, // erori de indexare
  // întrebare despre un partener existent (fișă, sold, situație, facturi, căutare)
  /\bcaut[a-z]*\s+partener[a-z]*\b|partener[a-z]*\b.*\b(sold[a-z]*|situat[a-z]*|fisa|detalii|dator|restante|scadente)\b|\b(sold[a-z]*|situat[a-z]*|fisa|detalii|ce facturi|care facturi|facturile|ce datoreaza|ce plateste)\b.*\bpartener[a-z]*\b/,
];

/** `true` dacă întrebarea cere date concrete din baza de date, nu din documente. */
export function isDbDataQuery(question: string): boolean {
  const q = normalize(question);
  if (EXPLAIN_FRAME.test(q)) return false;
  return DB_DATA_PATTERNS.some((re) => re.test(q));
}
