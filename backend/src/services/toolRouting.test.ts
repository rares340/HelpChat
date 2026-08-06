import { describe, expect, it } from 'vitest';
import { selectToolNames } from './toolRouting.js';

describe('selectToolNames', () => {
  it('balanță → get_balance', () => {
    const names = selectToolNames('Care este balanța dintre venituri și cheltuieli?');
    expect(names).toContain('get_balance');
  });

  it('facturi de plătit → list_invoices_to_pay', () => {
    const names = selectToolNames('Ce facturi am de plătit?');
    expect(names).toContain('list_invoices_to_pay');
  });

  it('creare factură → create_invoice + add_partner', () => {
    const names = selectToolNames('Creează o factură de 200 lei pentru firma Alpha');
    expect(names).toContain('create_invoice');
    expect(names).toContain('add_partner');
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
