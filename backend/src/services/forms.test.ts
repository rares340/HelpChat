import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { executeFormTool, getChatForm, selectFormIds } from './forms.js';

// Sufix unic per rulare, ca testele să nu se calce cu datele demo sau între ele.
// Offsets diferiți de tools.test.ts (Date.now() fără offset) ca fișierele rulate
// în paralel să nu colizioneze pe același CUI.
const runId = String(Date.now() + 1_000_000).slice(-9);
const CUI = runId; // CUI valid: doar cifre
const CUI2 = String(Date.now() + 3_000_000).slice(-9);
const SERIES = 'FRM';
const NUMBER = `F-${runId}`;

afterAll(async () => {
  for (const cui of [CUI, CUI2]) {
    await pool.query(
      `DELETE FROM facturi.invoices WHERE partner_id IN (SELECT id FROM facturi.partners WHERE cui = $1)`,
      [cui]
    );
    await pool.query(`DELETE FROM facturi.partners WHERE cui = $1`, [cui]);
  }
  await pool.end();
});

describe('selectFormIds', () => {
  it('creare factură → create_invoice (+ add_partner)', () => {
    expect(selectFormIds('Creează o factură de 200 lei pentru firma Alpha')).toContain('create_invoice');
  });

  it('adaugă partener → add_partner', () => {
    expect(selectFormIds('Adaugă partenerul Alfa SRL ca client')).toContain('add_partner');
  });

  it('înregistrează o plată → register_payment', () => {
    expect(selectFormIds('Înregistrează plata facturii 2026-0042')).toContain('register_payment');
  });

  it('„cum adaug o factură” → deschide tot formularul', () => {
    expect(selectFormIds('Cum adaug o factură în aplicație?')).toContain('create_invoice');
  });

  it('întrebare nefinanciară → fără formular', () => {
    expect(selectFormIds('Ajutor, ce poți face?')).toEqual([]);
  });

  it('listare facturi → fără formular (doar tool-uri de citire)', () => {
    expect(selectFormIds('Ce facturi am de plătit?')).toEqual([]);
  });
});

describe('getChatForm', () => {
  it('create_invoice are câmpurile obligatorii + defaults (TVA 19, RON, date)', () => {
    const form = getChatForm('create_invoice');
    const names = form.fields.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(['partner', 'direction', 'series', 'number', 'issue_date', 'due_date'])
    );
    expect(form.fields.find((f) => f.name === 'vat_rate')?.value).toBe(19);
    expect(form.fields.find((f) => f.name === 'currency')?.value).toBe('RON');
    const issue = form.fields.find((f) => f.name === 'issue_date')?.value;
    expect(String(issue)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pre-umple totalul din mesaj („de 200 lei")', () => {
    const form = getChatForm('create_invoice', 'Creează o factură de 200 lei pentru Alpha');
    expect(form.fields.find((f) => f.name === 'total_amount')?.value).toBe(200);
  });

  it('cele trei formulare au butoane de submit diferite', () => {
    expect(getChatForm('create_invoice').submitLabel).toMatch(/Creează/i);
    expect(getChatForm('add_partner').submitLabel).toMatch(/Adaugă/i);
    expect(getChatForm('register_payment').submitLabel).toMatch(/Înregistrează/i);
  });
});

describe('executeFormTool', () => {
  it('formular necunoscut → eroare', async () => {
    await expect(executeFormTool('nope' as never, {})).rejects.toThrow(/Formular necunoscut/);
  });

  it('create_invoice fără nicio sumă → eroare (fie bază, fie total)', async () => {
    await executeFormTool('add_partner', { name: `Firma ${runId}`, cui: CUI, is_client: true });
    await expect(
      executeFormTool('create_invoice', {
        partner: CUI,
        direction: 'issued',
        series: SERIES,
        number: NUMBER,
        issue_date: '2026-08-01',
        due_date: '2026-08-31',
      })
    ).rejects.toThrow(/fie baza|total_amount/i);
  });

  it('add_partner fără tip → needs_info', async () => {
    const res = await executeFormTool('add_partner', { name: `Test ${runId}`, cui: CUI2 });
    expect((res as { needs_info?: boolean }).needs_info).toBe(true);
  });

  it('ciclul complet: adaugă partener + creează factură (direct, fără LLM)', async () => {
    await executeFormTool('add_partner', { name: `Firma ${CUI2}`, cui: CUI2, is_client: true });
    const res = (await executeFormTool('create_invoice', {
      partner: CUI2,
      direction: 'issued',
      series: SERIES,
      number: `F-${CUI2}`,
      issue_date: '2026-08-01',
      due_date: '2026-08-31',
      net_amount: 100,
      vat_rate: 19,
    })) as { summary?: string; invoice?: { id?: number } };
    expect(res.summary).toMatch(/Factură emisă către/);
    expect(res.invoice?.id).toBeGreaterThan(0);
  });
});
