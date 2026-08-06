import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatForm, ChatMessage, Citation, Conversation, StarterSuggestions } from '@practica/shared';
import { api, streamChat } from '../api/client';
import { FormRenderer } from '../components/FormRenderer';

/** .docx nu are paginare fixă — afișăm doar fișierul. */
function formatRef(c: Citation): string {
  if (c.relPath.toLowerCase().endsWith('.docx')) return c.relPath;
  const pages = c.pageStart === c.pageEnd ? `pag. ${c.pageStart}` : `pag. ${c.pageStart}–${c.pageEnd}`;
  return `${c.relPath} · ${pages}`;
}

interface ToolCall {
  name: string;
  args: unknown;
  output?: unknown;
}

interface DraftMessage {
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Întrebări propuse pentru continuarea discuției. */
  suggestions: string[];
  streaming?: boolean;
  /** Tool-uri MCP apelate de model (ex. facturi, statistici). */
  toolCalls?: ToolCall[];
  /** Formulare dinamice deschise de asistent (ex. creare factură). */
  forms?: ChatForm[];
}

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DraftMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [starters, setStarters] = useState<StarterSuggestions | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(() => {
    api.listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(refreshConversations, [refreshConversations]);

  // Sugestiile de pornire depind de ce e indexat — se încarcă o dată.
  useEffect(() => {
    api.getSuggestions().then(setStarters).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const openConversation = useCallback((id: number | null) => {
    setActiveId(id);
    setOpenCitation(null);
    setError(null);
    if (id === null) {
      setMessages([]);
      return;
    }
    api
      .getMessages(id)
      .then((msgs: ChatMessage[]) =>
        setMessages(
          msgs.map((m) => ({
            role: m.role,
            content: m.content,
            citations: m.citations,
            suggestions: m.suggestions ?? [],
          }))
        )
      )
      .catch(() => setError('Nu am putut încărca conversația.'));
  }, []);

  /** `preset` vine din chips-urile de sugestii; altfel se trimite textul din compozitor. */
  async function send(preset?: string) {
    const q = (preset ?? question).trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setQuestion('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: q, citations: [], suggestions: [] },
      { role: 'assistant', content: '', citations: [], suggestions: [], streaming: true },
    ]);

    const updateLast = (fn: (m: DraftMessage) => DraftMessage) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

    try {
      await streamChat(q, activeId, (event) => {
        if (event.type === 'conversation') {
          setActiveId(event.conversationId);
        } else if (event.type === 'token') {
          updateLast((m) => ({ ...m, content: m.content + event.content }));
        } else if (event.type === 'tool_call') {
          updateLast((m) => ({
            ...m,
            toolCalls: [...(m.toolCalls ?? []), { name: event.name, args: event.args }],
          }));
        } else if (event.type === 'tool_result') {
          updateLast((m) => ({
            ...m,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.name === event.name && tc.output === undefined ? { ...tc, output: event.output } : tc
            ),
          }));
        } else if (event.type === 'done') {
          updateLast((m) => ({ ...m, citations: event.citations, streaming: false }));
        } else if (event.type === 'suggestions') {
          updateLast((m) => ({ ...m, suggestions: event.items }));
        } else if (event.type === 'form') {
          updateLast((m) => ({ ...m, forms: [...(m.forms ?? []), event.form] }));
        } else if (event.type === 'error') {
          setError(event.message);
          updateLast((m) => ({ ...m, streaming: false }));
        }
      });
    } catch (err) {
      setError((err as Error).message);
      updateLast((m) => ({ ...m, streaming: false }));
    } finally {
      setBusy(false);
      refreshConversations();
    }
  }

  async function removeConversation(id: number) {
    await api.deleteConversation(id);
    if (id === activeId) openConversation(null);
    refreshConversations();
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <button className="btn primary full" onClick={() => openConversation(null)}>
          + Conversație nouă
        </button>
        <ul className="conversation-list">
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? 'active' : ''}>
              <button className="conversation-title" onClick={() => openConversation(c.id)} title={c.title}>
                {c.title}
              </button>
              <button className="icon-btn" title="Șterge conversația" onClick={() => removeConversation(c.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-main">
        <div className="messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <h2>Întreabă documentele</h2>
              <p>
                Răspunsurile se bazează exclusiv pe PDF-urile indexate și includ citări cu fișierul și pagina sursă.
                Poți întreba și despre facturi, plăți sau parteneri.
              </p>
              {starters && starters.questions.length > 0 && (
                <div className="starters">
                  <span className="starters-label">Începe cu:</span>
                  <div className="suggestions">
                    {starters.questions.map((q) => (
                      <button key={q} className="suggestion-chip" onClick={() => send(q)} disabled={busy}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {starters && starters.topics.length > 0 && (
                <p className="starters-topics">Teme acoperite: {starters.topics.join(' · ')}</p>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="bubble">
                {m.role === 'assistant' ? (
                  <>
                    <ReactMarkdown>{m.content || (m.streaming ? '…' : '')}</ReactMarkdown>
                    {m.streaming && <span className="cursor">▍</span>}
                    {m.forms && m.forms.length > 0 && (
                      <div className="chat-forms">
                        {m.forms.map((f) => (
                          <FormRenderer
                            key={f.id}
                            form={f}
                            conversationId={activeId}
                            onSubmitted={refreshConversations}
                          />
                        ))}
                      </div>
                    )}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <details className="tool-calls">
                        <summary>Am consultat: {m.toolCalls.map((tc) => tc.name).join(', ')}</summary>
                        {m.toolCalls.map((tc, idx) => (
                          <div key={idx} className="tool-call">
                            <strong>{tc.name}</strong>
                            <pre>{JSON.stringify(tc.args, null, 2)}</pre>
                            {tc.output !== undefined && (
                              <>
                                <em>rezultat:</em>
                                <pre>{JSON.stringify(tc.output, null, 2)}</pre>
                              </>
                            )}
                          </div>
                        ))}
                      </details>
                    )}
                    {m.citations.length > 0 && (
                      <div className="citations">
                        {m.citations.map((c) => (
                          <button
                            key={c.label}
                            className="citation-chip"
                            onClick={() => setOpenCitation(openCitation?.chunkId === c.chunkId ? null : c)}
                            title={formatRef(c)}
                          >
                            [{c.label}] {formatRef(c)}
                            {c.source === 'ocr' && <span className="ocr-badge">OCR</span>}
                            {c.media.length > 0 && <span className="ocr-badge media-badge">📷 {c.media.length}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Continuările apar doar sub ultimul răspuns, ca să nu aglomereze firul. */}
                    {m.suggestions.length > 0 && !m.streaming && i === messages.length - 1 && (
                      <div className="suggestions follow-ups">
                        {m.suggestions.map((s) => (
                          <button key={s} className="suggestion-chip" onClick={() => send(s)} disabled={busy}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {m.citations.some((c) => c.media.length > 0) && (
                      <div className="media-strip">
                        {m.citations
                          .flatMap((c) => c.media.map((img) => ({ ...img, label: c.label, ref: formatRef(c) })))
                          .map((img) => (
                            <a key={img.id} href={img.url} target="_blank" rel="noreferrer" title={`[${img.label}] ${img.ref}`}>
                              <img src={img.url} alt={`Captură din [${img.label}] ${img.ref}`} loading="lazy" />
                            </a>
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
          {error && <div className="error-banner">Eroare: {error}</div>}
        </div>

        {openCitation && (
          <div className="citation-panel">
            <div className="citation-panel-header">
              <strong>
                [{openCitation.label}] {formatRef(openCitation)}
              </strong>
              <button className="icon-btn" onClick={() => setOpenCitation(null)}>
                ✕
              </button>
            </div>
            <blockquote>{openCitation.snippet}</blockquote>
            {openCitation.media.length > 0 && (
              <div className="media-strip">
                {openCitation.media.map((img) => (
                  <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                    <img src={img.url} alt={`Captură din ${openCitation.relPath}`} loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="composer">
          <textarea
            value={question}
            placeholder="Pune o întrebare despre documente…"
            rows={2}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" disabled={busy || !question.trim()} onClick={() => send()}>
            {busy ? 'Se generează…' : 'Trimite'}
          </button>
        </div>
      </main>
    </div>
  );
}
