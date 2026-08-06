import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Izolăm testele de rețea: embeddings/chat vin din mock, DB-ul e cel real.
// chatStream emite delte { content?, toolCalls? } — contractul din ollama.ts.
vi.mock('./services/ollama.js', () => ({
  embed: vi.fn(async (input: string[]) => input.map(() => Array(1024).fill(0.01))),
  chat: vi.fn(async () => 'Răspuns de test [S1].'),
  chatStream: vi.fn(async function* () {
    yield { content: 'Răspuns ' };
    yield { content: 'de test [S1].' };
  }),
  ocrImage: vi.fn(async () => ''),
  checkOllama: vi.fn(async () => ({ ok: true, problems: [] })),
}));

const { buildServer } = await import('./app.js');
const { pool } = await import('./db/pool.js');
const { chatStream, chat } = await import('./services/ollama.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('API', () => {
  it('GET /api/documents răspunde cu lista documentelor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/documents' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/chat fără întrebare → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chat', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/chat cu conversație inexistentă → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Test?', conversationId: 99_999_999 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('ciclu complet de conversație: creare prin chat, listare, mesaje, ștergere', async () => {
    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Întrebare de test pentru integrare?' },
    });
    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.headers['content-type']).toContain('text/event-stream');

    const events = chatRes.body
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JSON.parse(b.slice(6)));

    const conversation = events.find((e) => e.type === 'conversation');
    const done = events.find((e) => e.type === 'done');
    expect(conversation).toBeDefined();
    expect(done).toBeDefined();
    expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe('Răspuns de test [S1].');

    const conversationId = conversation.conversationId as number;
    const messages = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages` });
    const parsed = messages.json() as Array<{ role: string; content: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe('user');
    expect(parsed[1].role).toBe('assistant');

    const del = await app.inject({ method: 'DELETE', url: `/api/conversations/${conversationId}` });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages` });
    expect(after.json()).toHaveLength(0);
  });

  it('chat cu tool-uri de facturi: execută tool-ul și răspunde fără citări fallback', async () => {
    // Runda 1: modelul cere un tool; runda 2: răspunsul final.
    vi.mocked(chatStream)
      .mockImplementationOnce(async function* () {
        yield { toolCalls: [{ id: 'call_1', function: { name: 'get_balance', arguments: { period: 'current_month' } } }] };
      })
      .mockImplementationOnce(async function* () {
        yield { content: 'Balanța pe luna curentă este echilibrată.' };
      });

    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Care este balanța dintre venituri și cheltuieli?' },
    });
    expect(res.statusCode).toBe(200);

    const events = res.body
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JSON.parse(b.slice(6)));

    const tool = events.find((e) => e.type === 'tool');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('get_balance');
    expect(tool.summary).toMatch(/balanța/i);

    expect(events.filter((e) => e.type === 'token').map((e) => e.content).join('')).toBe(
      'Balanța pe luna curentă este echilibrată.'
    );

    // Al doilea apel către model primește rezultatul tool-ului ca mesaj role "tool".
    const secondCallMessages = vi.mocked(chatStream).mock.calls[vi.mocked(chatStream).mock.calls.length - 1][0];
    const toolMessage = secondCallMessages.find((m) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.tool_name).toBe('get_balance');
    expect(JSON.parse(toolMessage!.content)).toHaveProperty('invoiced_issued');

    // Răspuns bazat pe tool-uri, fără etichete [Sn] → fără citări fallback.
    const done = events.find((e) => e.type === 'done');
    expect(done.citations).toEqual([]);

    const conversationId = events.find((e) => e.type === 'conversation').conversationId as number;
    const messages = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages` });
    // Mesajele intermediare (assistant cu tool_calls, tool) nu se persistă.
    expect(messages.json()).toHaveLength(2);
    await app.inject({ method: 'DELETE', url: `/api/conversations/${conversationId}` });
  });

  it('GET /api/suggestions propune teme și întrebări de pornire', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/suggestions' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { topics: string[]; questions: string[] };
    expect(Array.isArray(body.topics)).toBe(true);
    expect(Array.isArray(body.questions)).toBe(true);
    // Fiecare sugestie e o întrebare gata de trimis.
    for (const q of body.questions) expect(q.endsWith('?')).toBe(true);
  });

  it('chat: sugestiile de continuare sunt emise după done și persistate', async () => {
    vi.mocked(chat).mockResolvedValueOnce('Cum adaug un document nou?\nCe rapoarte sunt disponibile?');

    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Întrebare de test pentru sugestii?' },
    });
    const events = chatRes.body
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JSON.parse(b.slice(6)));

    const done = events.find((e) => e.type === 'done');
    const suggestions = events.find((e) => e.type === 'suggestions');
    expect(suggestions).toBeDefined();
    expect(suggestions.items).toEqual(['Cum adaug un document nou?', 'Ce rapoarte sunt disponibile?']);
    // Ordinea contează: sugestiile vin după răspunsul finalizat.
    expect(events.indexOf(suggestions)).toBeGreaterThan(events.indexOf(done));
    expect(suggestions.messageId).toBe(done.messageId);

    const conversationId = events.find((e) => e.type === 'conversation').conversationId as number;
    const messages = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages` });
    const persisted = messages.json() as Array<{ role: string; suggestions: string[] }>;
    expect(persisted[1].suggestions).toEqual(suggestions.items);

    await app.inject({ method: 'DELETE', url: `/api/conversations/${conversationId}` });
  });

  it('GET /api/admin/status raportează contoarele', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.documents).toHaveProperty('active');
    expect(typeof body.chunks).toBe('number');
  });

  it('POST /api/forms/:formId necunoscut → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/forms/nope', payload: { values: {} } });
    expect(res.statusCode).toBe(404);
    expect(res.json().ok).toBe(false);
  });

  it('POST /api/forms/add_partner fără tip → 400 cu needs_info', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/forms/add_partner',
      payload: { values: { name: 'X', cui: '999999999' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().needs_info).toBe(true);
  });

  it('POST /api/forms: creează partener + factură direct (fără LLM) și persistă confirmarea', async () => {
    const cui = String(Date.now() + 2_000_000).slice(-9); // CUI valid: doar cifre, offset distinct de alte fișiere
    const series = 'FRM';
    const number = `F-${Date.now()}`;
    const conversationId = (await pool.query(
      `INSERT INTO conversations (title) VALUES ('form-test') RETURNING id`
    )).rows[0].id as number;
    try {
      const addRes = await app.inject({
        method: 'POST',
        url: '/api/forms/add_partner',
        payload: { values: { name: `Firma ${cui}`, cui, is_client: true }, conversationId },
      });
      expect(addRes.statusCode).toBe(200);
      expect(addRes.json().ok).toBe(true);
      expect(addRes.json().message).toMatch(/Partener adăugat/i);

      const invRes = await app.inject({
        method: 'POST',
        url: '/api/forms/create_invoice',
        payload: {
          values: { partner: cui, direction: 'issued', series, number, issue_date: '2026-08-01', due_date: '2026-08-31', net_amount: 100, vat_rate: 19 },
          conversationId,
        },
      });
      expect(invRes.statusCode).toBe(200);
      expect(invRes.json().ok).toBe(true);
      expect(invRes.json().message).toMatch(/Factură emisă către/);
      expect(invRes.json().data.invoice.id).toBeGreaterThan(0);

      // Confirmarea a fost persistată ca mesaj asistent în conversație.
      const messages = await app.inject({ method: 'GET', url: `/api/conversations/${conversationId}/messages` });
      const persisted = messages.json() as Array<{ role: string; content: string }>;
      expect(persisted.some((m) => m.role === 'assistant' && /Factură emisă/.test(m.content))).toBe(true);
    } finally {
      await pool.query(`DELETE FROM facturi.invoices WHERE partner_id IN (SELECT id FROM facturi.partners WHERE cui = $1)`, [cui]);
      await pool.query(`DELETE FROM facturi.partners WHERE cui = $1`, [cui]);
      await pool.query(`DELETE FROM conversations WHERE id = $1`, [conversationId]);
    }
  });

  it('POST /api/chat cu cerere de creare → emite eveniment form pre-umplut', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Creează o factură de 200 lei pentru firma Alpha' },
    });
    expect(res.statusCode).toBe(200);
    const events = res.body
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JSON.parse(b.slice(6)));
    const forms = events.filter((e) => e.type === 'form').map((e) => e.form) as Array<{
      id: string;
      fields: Array<{ name: string; value?: string | number | boolean }>;
    }>;
    expect(forms.map((f) => f.id)).toContain('create_invoice');
    const invoice = forms.find((f) => f.id === 'create_invoice');
    expect(invoice!.fields.find((x) => x.name === 'total_amount')?.value).toBe(200);

    const conversationId = events.find((e) => e.type === 'conversation').conversationId as number;
    await app.inject({ method: 'DELETE', url: `/api/conversations/${conversationId}` });
  });
});
