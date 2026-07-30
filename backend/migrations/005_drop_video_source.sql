-- Modulul de indexare video a fost eliminat din aplicație.
-- Fragmentele care aveau source='video' sunt reclasificate ca 'text' ca să
-- eliberăm constrângerea CHECK și să putem elimina valoarea din enum.

UPDATE chunks SET source = 'text' WHERE source = 'video';

ALTER TABLE chunks DROP CONSTRAINT chunks_source_check;
ALTER TABLE chunks ADD CONSTRAINT chunks_source_check CHECK (source IN ('text', 'ocr'));
