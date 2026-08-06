import { describe, expect, it } from 'vitest';
import { isDbDataQuery, selectToolNames } from './toolRouting.js';

describe('selectToolNames', () => {
  it('balanță → get_balance', () => {
    const names = selectToolNames('Care este balanța dintre venituri și cheltuieli?');
    expect(names).toContain('get_balance');
  });

  it('facturi de plătit → list_invoices_to_pay', () => {
    const names = selectToolNames('Ce facturi am de plătit?');
    expect(names).toContain('list_invoices_to_pay');
  });

  it('creare factură → create_invoice, fără add_partner', () => {
    const names = selectToolNames('Creează o factură de 200 lei pentru firma Alpha');
    expect(names).toContain('create_invoice');
    expect(names).not.toContain('add_partner');
  });

  it('adaugă partener → add_partner (creare)', () => {
    const names = selectToolNames('Adaugă partenerul Alfa SRL');
    expect(names).toContain('add_partner');
    expect(names).not.toContain('get_partner_statement');
  });

  it('întrebare despre un partener existent → fișa partenerului, nu formular', () => {
    const names = selectToolNames('Care e soldul partenerului Alfa?');
    expect(names).toContain('get_partner_statement');
    expect(names).not.toContain('add_partner');
  });

  it('fă o factură la partener → create_invoice fără add_partner', () => {
    const names = selectToolNames('Fă o factură la partenerul Alfa');
    expect(names).toContain('create_invoice');
    expect(names).not.toContain('add_partner');
  });

  it('actualizează partener → update_partner', () => {
    expect(selectToolNames('Actualizează datele partenerului Alfa')).toContain('update_partner');
  });

  it('statistici → tool-uri de stats', () => {
    const names = selectToolNames('Câte documente avem indexate și ce a eșuat?');
    expect(names).toContain('get_document_stats');
  });

  it('întrebare nefinanciară → fără tool-uri', () => {
    expect(selectToolNames('Ajutor, ce poți face?')).toEqual([]);
  });

  it('plafon: niciodată mai mult de 4 tool-uri', () => {
    const names = selectToolNames('Vreau balanța, facturile de plătit, de încasat și statisticile');
    expect(names.length).toBeLessThanOrEqual(4);
  });
});

describe('isDbDataQuery', () => {
  it('facturi de plătit → date din DB', () => {
    expect(isDbDataQuery('Ce facturi am de plătit?')).toBe(true);
  });

  it('încasat pe perioadă → date din DB', () => {
    expect(isDbDataQuery('Cât am încasat luna trecută?')).toBe(true);
  });

  it('balanță pe ultima lună → date din DB', () => {
    expect(isDbDataQuery('Care e balanța pe ultima lună?')).toBe(true);
  });

  it('statistici de index → date din DB', () => {
    expect(isDbDataQuery('Câte documente avem indexate?')).toBe(true);
  });

  it('„cum adaug” → explicativ, NU date din DB (rămâne pe RAG + formular)', () => {
    expect(isDbDataQuery('Cum adaug o factură?')).toBe(false);
  });

  it('„cum se calculează” → explicativ, NU date din DB', () => {
    expect(isDbDataQuery('Cum se calculează soldul în aplicație?')).toBe(false);
  });

  it('„ce înseamnă” → explicativ, NU date din DB', () => {
    expect(isDbDataQuery('Ce înseamnă „de încasat”?')).toBe(false);
  });

  it('creare factură → acțiune (formular), NU date din DB', () => {
    expect(isDbDataQuery('Creează o factură de 200 lei pentru firma Alpha')).toBe(false);
  });

  it('întrebare nefinanciară → NU date din DB', () => {
    expect(isDbDataQuery('Ajutor, ce poți face?')).toBe(false);
  });

  it('sold partener existent → date din DB', () => {
    expect(isDbDataQuery('Care e soldul partenerului Alfa?')).toBe(true);
  });

  it('fișa partenerului → date din DB', () => {
    expect(isDbDataQuery('Arată-mi fișa partenerului Alfa')).toBe(true);
  });

  it('caută partener → date din DB', () => {
    expect(isDbDataQuery('Caută partenerul Alfa în baza de date')).toBe(true);
  });

  it('adaugă partener → NU date din DB (formular de creare)', () => {
    expect(isDbDataQuery('Adaugă partenerul Alfa SRL')).toBe(false);
  });
});
