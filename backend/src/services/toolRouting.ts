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
    // "creează/adaugă/emite o factură" → creare + parteneri (fără resolve — încă neimplementat)
    // Verbul de creare poate fi înaintea sau după "factur" ("creează o factură", "factură nouă").
    pattern: /(creeaz|adaug|emit|fac o).*factur|factur.*(nou|creat)/,
    tools: ['create_invoice', 'add_partner'],
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
  { pattern: /partener/, tools: ['add_partner', 'update_partner'] },
  { pattern: /anul|renunt|storn|cancel/, tools: ['cancel_invoice'] },
  { pattern: /statistic.*(factur|plati)/, tools: ['get_statistics'] },
];

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
  return chosen.slice(0, HARD_CAP);
}
