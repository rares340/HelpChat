Specificație de implementare — aplicație web RAG cu modele AI locale

1. Rolul documentului

Acest document este specificația de lucru pentru agentul de coding care va proiecta, implementa, testa și documenta aplicația.

Agentul trebuie să livreze o aplicație complet funcțională, nu doar un prototip de interfață. Implementarea trebuie să includă:

backend Node.js cu TypeScript;

frontend React cu TypeScript;

PostgreSQL cu extensia pgvector;

integrare exclusivă cu modele AI instalate local;

indexarea incrementală a documentelor PDF dintr-un folder configurabil;

chat RAG cu răspunsuri fundamentate în documente și citări pe fișier/pagină;

persistența conversațiilor;

monitorizarea și reindexarea documentelor;

teste automate;

rulare locală prin Docker Compose și instrucțiuni de instalare fără Docker.

2. Obiectiv

Aplicația trebuie să permită utilizatorului să adreseze întrebări în limbaj natural și să primească răspunsuri bazate exclusiv pe conținutul documentelor PDF indexate.

Fluxul principal este:

Aplicația identifică documentele PDF dintr-un folder local configurat.

Extrage textul păstrând legătura cu paginile sursă.

Împarte textul în fragmente potrivite pentru căutare.

Generează local vectorii de tip embedding.

Salvează documentele, fragmentele și vectorii în PostgreSQL + pgvector.

La o întrebare, caută fragmentele relevante prin căutare hibridă semantică și lexicală.

Trimite modelului local numai întrebarea, istoricul relevant și fragmentele recuperate.

Returnează răspunsul în flux continuu, împreună cu citări verificabile.

Aplicația trebuie să răspundă în limba întrebării. Pentru întrebări în limba română, răspunsul va fi în limba română.

3. Principii obligatorii

Local-first — documentele, întrebările, răspunsurile și vectorii nu trebuie trimise către servicii AI externe.

Grounded answers — afirmațiile factuale trebuie susținute de fragmentele recuperate.

Citări verificabile — utilizatorul trebuie să poată vedea documentul, pagina și fragmentul care susțin răspunsul.

Răspuns prudent — dacă informația nu există în documente, aplicația trebuie să spună clar acest lucru.

Ingestie idempotentă — scanarea repetată a aceluiași folder nu trebuie să dubleze documente sau fragmente.

Actualizare atomică — o versiune veche indexată rămâne disponibilă până când versiunea nouă este procesată complet.

Configurabilitate — numele modelelor, dimensiunea vectorilor, folderul PDF și parametrii RAG nu se codifică direct în surse.

Observabilitate — erorile de parsare, embedding, interogare și generare trebuie înregistrate și afișate administrativ.

Siguranță — conținutul documentelor este tratat ca date, nu ca instrucțiuni pentru model.

Implementare transparentă — pipeline-ul RAG trebuie implementat în servicii proprii, testabile. Nu se va introduce LangChain în MVP.
