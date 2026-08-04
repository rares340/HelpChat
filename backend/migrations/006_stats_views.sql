-- View-uri de statistici pentru dashboard-ul Admin și tool-urile MCP.
-- Citite prin /api/stats/* (fără LLM) și prin tool-urile get_*_stats.

-- 1. Număr de documente pe fiecare status.
CREATE OR REPLACE VIEW v_document_stats AS
SELECT
  count(*) FILTER (WHERE status = 'active')   AS active,
  count(*) FILTER (WHERE status = 'indexing') AS indexing,
  count(*) FILTER (WHERE status = 'failed')   AS failed,
  count(*) FILTER (WHERE status = 'deleted')  AS deleted,
  count(*)                                    AS total
FROM documents;

-- 2. Conversații și mesaje agregate pe zi (UTC, pentru consistență).
CREATE OR REPLACE VIEW v_usage_daily AS
SELECT
  date_trunc('day', c.created_at)::date AS day,
  count(DISTINCT c.id)                   AS conversations,
  count(m.id)                            AS messages
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY 1
ORDER BY 1 DESC;

-- 3. Ultimele N evenimente de eroare din ingestion.
CREATE OR REPLACE VIEW v_recent_errors AS
SELECT
  id,
  level,
  stage,
  rel_path,
  message,
  created_at
FROM ingestion_events
WHERE level = 'error'
ORDER BY created_at DESC;

-- 4. Top documente citate: numără câte ori apare fiecare documentId
--    în array-ul JSONB messages.citations.
CREATE OR REPLACE VIEW v_top_cited_documents AS
SELECT
  (c->>'documentId')::bigint          AS document_id,
  max(c->>'relPath')                  AS rel_path,
  max(c->>'title')                    AS title,
  count(*)                            AS citation_count
FROM messages m,
     jsonb_array_elements(m.citations) AS c
WHERE m.citations <> '[]'::jsonb
GROUP BY 1
HAVING count(*) > 0
ORDER BY citation_count DESC;
