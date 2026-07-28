-- Fragmentele pot proveni acum și din video (cadre descrise de modelul vision).
ALTER TABLE chunks DROP CONSTRAINT chunks_source_check;
ALTER TABLE chunks ADD CONSTRAINT chunks_source_check CHECK (source IN ('text', 'ocr', 'video'));
