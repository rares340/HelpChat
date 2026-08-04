import { useCallback, useEffect, useState } from 'react';
import type {
  DocumentSummary,
  IndexStatus,
  IngestionEvent,
  RecentError,
  TopCitedDocument,
  UsageDaily,
} from '@practica/shared';
import { api } from '../api/client';

const STATUS_LABELS: Record<string, string> = {
  active: 'activ',
  indexing: 'se indexează',
  failed: 'eșuat',
  deleted: 'șters',
};

export function AdminPage() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [events, setEvents] = useState<IngestionEvent[]>([]);
  const [usage, setUsage] = useState<UsageDaily[]>([]);
  const [topCited, setTopCited] = useState<TopCitedDocument[]>([]);
  const [errors, setErrors] = useState<RecentError[]>([]);
  const [reindexing, setReindexing] = useState(false);

  const refresh = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.getDocuments().then(setDocuments).catch(() => {});
    api.getEvents(100).then(setEvents).catch(() => {});
    api.getStatsUsage(30).then((r) => setUsage(r.daily)).catch(() => {});
    api.getStatsTopCited(10).then((r) => setTopCited(r.documents)).catch(() => {});
    api.getStatsErrors(20).then((r) => setErrors(r.errors)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function reindex() {
    setReindexing(true);
    await api.reindex();
    setTimeout(() => {
      setReindexing(false);
      refresh();
    }, 1500);
  }

  return (
    <div className="admin">
      <section className="cards">
        <div className="card">
          <div className="card-value">{status?.documents.active ?? '–'}</div>
          <div className="card-label">documente active</div>
        </div>
        <div className="card">
          <div className="card-value">{status?.chunks ?? '–'}</div>
          <div className="card-label">fragmente indexate</div>
        </div>
        <div className="card">
          <div className="card-value">{status ? (status.running ? 'da' : 'nu') : '–'}</div>
          <div className="card-label">indexare în curs</div>
        </div>
        <div className="card">
          <div className="card-value warn">{(status?.documents.failed ?? 0) > 0 ? status?.documents.failed : 0}</div>
          <div className="card-label">documente eșuate</div>
        </div>
        <button className="btn primary" onClick={reindex} disabled={reindexing || status?.running}>
          {status?.running ? 'Indexare în curs…' : reindexing ? 'Pornit…' : 'Reindexează acum'}
        </button>
      </section>

      <section>
        <h2>Documente</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Fișier</th>
              <th>Status</th>
              <th>Pagini</th>
              <th>Fragmente</th>
              <th>din care OCR</th>
              <th>Indexat la</th>
              <th>Eroare</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className={d.status === 'failed' ? 'row-failed' : ''}>
                <td>{d.relPath}</td>
                <td>
                  <span className={`status status-${d.status}`}>{STATUS_LABELS[d.status] ?? d.status}</span>
                </td>
                <td>{d.pageCount ?? '–'}</td>
                <td>{d.chunkCount}</td>
                <td>{d.ocrChunkCount > 0 ? d.ocrChunkCount : '–'}</td>
                <td>{d.indexedAt ? new Date(d.indexedAt).toLocaleString('ro-RO') : '–'}</td>
                <td className="error-cell">{d.error ?? ''}</td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Niciun document indexat încă. Pune PDF-uri în folderul configurat (PDF_DIR).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Jurnal de ingestie</h2>
        <div className="event-log">
          {events.map((e) => (
            <div key={e.id} className={`event event-${e.level}`}>
              <span className="event-time">{new Date(e.createdAt).toLocaleTimeString('ro-RO')}</span>
              <span className="event-stage">{e.stage}</span>
              <span className="event-message">
                {e.relPath ? `[${e.relPath}] ` : ''}
                {e.message}
              </span>
            </div>
          ))}
          {events.length === 0 && <div className="muted">Niciun eveniment încă.</div>}
        </div>
      </section>

      <section>
        <h2>Utilizare (ultimele 30 zile)</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Zi</th>
              <th>Conversații</th>
              <th>Mesaje</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.day}>
                <td>{new Date(u.day).toLocaleDateString('ro-RO')}</td>
                <td>{u.conversations}</td>
                <td>{u.messages}</td>
              </tr>
            ))}
            {usage.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Nicio conversație în ultimele 30 de zile.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Top documente citate</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Citări</th>
            </tr>
          </thead>
          <tbody>
            {topCited.map((d) => (
              <tr key={d.document_id}>
                <td title={d.rel_path}>{d.title || d.rel_path}</td>
                <td>{d.citation_count}</td>
              </tr>
            ))}
            {topCited.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  Încă nu există citări în răspunsuri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Erori recente (ingestie)</h2>
        <div className="event-log">
          {errors.map((e) => (
            <div key={e.id} className="event event-error">
              <span className="event-time">{new Date(e.createdAt).toLocaleString('ro-RO')}</span>
              <span className="event-stage">{e.stage}</span>
              <span className="event-message">
                {e.relPath ? `[${e.relPath}] ` : ''}
                {e.message}
              </span>
            </div>
          ))}
          {errors.length === 0 && <div className="muted">Nicio eroare recentă. 👍</div>}
        </div>
      </section>
    </div>
  );
}
