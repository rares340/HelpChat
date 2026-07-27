import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Izolăm testele de rețea: embeddings/chat vin din mock, DB-ul e cel real.
vi.mock('./services/ollama.js', () => ({
  embed: vi.fn(async (input: string[]) => input.map(() => Array(1024).fill(0.01))),
  chat: vi.fn(async () => 'Răspuns de test [S1].'),
  chatStream: vi.fn(async function* () {
    yield 'Răspuns ';
    yield 'de test [S1].';
  }),
  ocrImage: vi.fn(async () => ''),
  checkOllama: vi.fn(async () => ({ ok: true, problems: [] })),
}));

const { buildServer } = await import('./app.js');
const { pool } = await import('./db/pool.js');

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

  it('GET /api/admin/status raportează contoarele', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.documents).toHaveProperty('active');
    expect(typeof body.chunks).toBe('number');
  });
});
