/**
 * Formulare dinamice deschise în chat la cereri de creare (factură, partener,
 * plată). Definițiile de câmpuri sunt scrise manual, dar trebuie să se
 * potrivească cu schemele zod din facturi/tools.ts — valorile submit se
 * validează cu aceleași scheme prin executeToolObject.
 */
import type { ChatForm, FormField } from '@practica/shared';
import { selectToolNames } from './toolRouting.js';
import { executeToolObject } from './facturi/tools.js';

/** Tool-urile pentru care deschidem formular în loc de (doar) tool-calling. */
export const FORM_TOOL_IDS: ChatForm['id'][] = ['create_invoice', 'add_partner', 'register_payment'];

/** Ordinea utilă în care se afișează formularele (partenerul înainte de factură). */
const FORM_ORDER: ChatForm['id'][] = ['add_partner', 'create_invoice', 'register_payment'];

/** Etichetele afișate pentru select-uri; valorile rămân cele din enum-urile zod. */
const DIRECTION_OPTS = [
  { value: 'issued', label: 'Emisă (către client)' },
  { value: 'received', label: 'Primită (de la furnizor)' },
];
const METHOD_OPTS = [
  { value: 'bank_transfer', label: 'Transfer bancar' },
  { value: 'cash', label: 'Numerar' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Altă metodă' },
];

/** Scurtator pentru câmpuri. */
const f = (name: string, label: string, type: FormField['type'], extra: Partial<FormField> = {}): FormField => ({
  name,
  label,
  type,
  ...extra,
});

/** Dată YYYY-MM-DD în fusul local. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const today = () => isoDate(new Date());
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

/** Extrage o sumă din mesaj („de 200 lei" → 200). Deterministic, fără LLM. */
const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(?:lei|ron)\b/i;
function extractAmount(question: string): number | undefined {
  const m = question.match(AMOUNT_RE);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function buildInvoiceForm(question: string): ChatForm {
  return {
    id: 'create_invoice',
    title: 'Factură nouă',
    submitLabel: 'Creează factura',
    fields: [
      f('partner', 'Partener', 'text', { required: true, placeholder: 'Nume sau CUI' }),
      f('direction', 'Direcție', 'select', { required: true, options: DIRECTION_OPTS, value: 'issued' }),
      f('series', 'Serie', 'text', { required: true, placeholder: 'ex. INV' }),
      f('number', 'Număr', 'text', { required: true, placeholder: 'ex. 2026-0001' }),
      f('issue_date', 'Data emiterii', 'date', { required: true, value: today() }),
      f('due_date', 'Data scadenței', 'date', { required: true, value: inDays(30) }),
      f('net_amount', 'Bază (fără TVA)', 'number', {
        description: 'Alternativă la total — dă una dintre ele, restul se calculează.',
      }),
      f('total_amount', 'Total (cu TVA)', 'number', {
        value: extractAmount(question),
        description: 'Alternativă la bază.',
      }),
      f('vat_rate', 'TVA %', 'number', { value: 19 }),
      f('currency', 'Monedă', 'text', { value: 'RON' }),
      f('notes', 'Note', 'textarea'),
    ],
  };
}

function buildPartnerForm(): ChatForm {
  return {
    id: 'add_partner',
    title: 'Partener nou',
    submitLabel: 'Adaugă partenerul',
    fields: [
      f('name', 'Denumire', 'text', { required: true }),
      f('cui', 'CUI', 'text', { required: true, placeholder: 'cu sau fără RO' }),
      f('is_client', 'Client (îi emitem facturi)', 'boolean'),
      f('is_supplier', 'Furnizor (primim facturi de la el)', 'boolean'),
      f('registration_number', 'Nr. Registrul Comerțului', 'text'),
      f('email', 'Email', 'text'),
      f('phone', 'Telefon', 'text'),
      f('address', 'Adresă', 'text'),
      f('city', 'Oraș', 'text'),
      f('country', 'Țara', 'text', { value: 'România' }),
      f('iban', 'IBAN', 'text'),
    ],
  };
}

function buildPaymentForm(): ChatForm {
  return {
    id: 'register_payment',
    title: 'Înregistrează plată / încasare',
    submitLabel: 'Înregistrează plata',
    fields: [
      f('invoice_id', 'ID factură', 'number', { description: 'Sau identifică factura prin serie + număr.' }),
      f('series', 'Seria facturii', 'text'),
      f('number', 'Numărul facturii', 'text'),
      f('direction', 'Direcție (dacă e ambiguă)', 'select', { options: DIRECTION_OPTS }),
      f('amount', 'Suma', 'number', { required: true }),
      f('payment_date', 'Data plății', 'date', { value: today() }),
      f('method', 'Metoda', 'select', { options: METHOD_OPTS, value: 'bank_transfer' }),
      f('reference', 'Referință', 'text', { placeholder: 'nr. OP' }),
      f('notes', 'Note', 'textarea'),
    ],
  };
}

/** Formularele de deschis pentru o întrebare (bazat pe intenția existentă de tool-uri). */
export function selectFormIds(question: string): ChatForm['id'][] {
  const selected = new Set(selectToolNames(question));
  return FORM_ORDER.filter((id) => selected.has(id));
}

/** Definiția completă a unui formular (câmpuri + defaults, cu pre-umplere din mesaj). */
export function getChatForm(id: ChatForm['id'], question = ''): ChatForm {
  switch (id) {
    case 'create_invoice':
      return buildInvoiceForm(question);
    case 'add_partner':
      return buildPartnerForm();
    case 'register_payment':
      return buildPaymentForm();
  }
}

/** Validează și execută submit-ul unui formular; întoarce obiectul rezultat (are `summary`). */
export async function executeFormTool(id: ChatForm['id'], values: Record<string, unknown>): Promise<unknown> {
  if (!FORM_TOOL_IDS.includes(id)) throw new Error(`Formular necunoscut: ${id}.`);
  return executeToolObject(id, values);
}
