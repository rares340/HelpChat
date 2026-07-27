# Modele AI locale INDECO — ghid de utilizare

Două servere Ollama în rețeaua internă, fără cost per token și fără date trimise în afară.
Toate cifrele din acest document sunt **măsurate direct pe servere** (17 iulie 2026), nu estimate din specificații.

| | **192.168.100.54** | **192.168.100.55** |
|---|---|---|
| Hardware | NVIDIA **L40** | **DGX Spark** (GB10) |
| Memorie | 48 GB GDDR6 (**~43 GB utilizabili**) | 128 GB unified (**~96 GB verificați**) |
| Bandwidth | ~864 GB/s | ~273 GB/s |
| Ollama | 0.30.10 | 0.18.2 |
| Modele | 17 | 7 |
| Endpoint | `http://192.168.100.54:11434` | `http://192.168.100.55:11434` |

---

## 1. Diferența dintre servere: viteză vs. memorie

Asta e singura decizie importantă. Regula, pe scurt:

> **Modelul încape în 43 GB? → `.54` (L40), e de 2.5x mai rapid.**
> **Modelul e mai mare de 43 GB? → `.55` (Spark), e singurul care îl ține întreg.**

### De ce

Viteza de generare a unui LLM e limitată de **bandwidth-ul memoriei**, nu de puterea de calcul: pentru fiecare token generat, placa trebuie să citească toate greutățile modelului din memorie. L40 citește la ~864 GB/s, Spark la ~273 GB/s — de aici raportul de ~2.5x în favoarea L40, **atâta timp cât modelul încape în VRAM**.

Când modelul **nu** încape, Ollama mută o parte din greutăți în RAM-ul de sistem și le rulează pe CPU. Acea parte devine de zeci de ori mai lentă și trage tot modelul în jos. Spark nu are problema asta: are 128 GB de memorie unificată, deci ține modele mari integral pe GPU — mai încet per token, dar fără prăbușire.

### Măsurători reale

**`gpt-oss:20b` (13.8 GB — încape peste tot):**

| | `.54` L40 | `.55` Spark |
|---|---|---|
| Generare | **143.0 tok/s** | 58.2 tok/s |
| Prompt (citire input) | 333.9 tok/s | **716.5 tok/s** |
| Pe GPU | 100% | 100% |

→ **L40 câștigă la generare de 2.5x.** Spark citește promptul mai repede (are mai mult compute brut), deci la prompturi foarte lungi cu răspuns scurt diferența se reduce.

**`gpt-oss:120b` (65 GB — nu încape pe L40):**

| | `.54` L40 | `.55` Spark |
|---|---|---|
| Generare | 20.6 tok/s | **38.8 tok/s** |
| Pe GPU | **63%** (42.9 din 67.9 GB) | **100%** (70.8 GB) |

→ **Se inversează.** L40 se revarsă pe CPU cu 37% din model și pierde. Spark e de ~1.9x mai rapid.

**`qwen3.5:122b` (81 GB — doar pe Spark):**
21.2 tok/s, **95.9 GB integral pe GPU**, load 47s. Pe L40 nici nu e instalat — n-ar avea sens.

### Bonus: Spark ține mai multe modele simultan

În timpul testelor, `.55` avea încărcate în același timp `qwen3.5:122b` (95.9 GB) **și** `gpt-oss:20b` (17.6 GB) — ambele 100% pe GPU. Util dacă vrei un model mare + unul mic de triaj fără reload-uri. Pe L40 orice al doilea model mare forțează un swap (load = 7-47s).

### Cum alegi în practică

| Situație | Server |
|---|---|
| Chat interactiv, utilizator așteaptă răspunsul | **`.54`** — viteza se simte |
| Volum mare de documente, rulare peste noapte | **`.54`** dacă modelul încape, altfel `.55` |
| Ai nevoie de calitatea maximă (122b / 120b) | **`.55`** |
| Vision pe imagini mari (72b) | **`.55`** |
| Embeddings / RAG | **`.54`** — e singurul care are modele de embedding |
| OCR | **`.54`** — `glm-ocr` e doar acolo |

---

## 2. Modele pe 192.168.100.54 (L40 — rapid)

**Plafon: ~43 GB.** Ce e peste se revarsă pe CPU și încetinește drastic. Marcat cu ⚠️ mai jos.

### Chat / raționament

| Model | Mărime | Params | Context | Capabilități | Rang |
|---|---|---|---|---|---|
| `llama3.3:70b` | 42.5 GB | 70.6B | 131k | tools | ⚠️ **La limită.** Cel mai bun model care (abia) încape pe L40. Foarte bun general-purpose, multilingv decent. Testează-l — dacă se revarsă, mută-te pe `.55`. |
| `qwen2.5:72b` | 47.4 GB | 72.7B | 32k | tools | ⚠️ **Se revarsă.** Peste plafon → CPU spill. Preferă `llama3.3:70b` aici sau `.55` pentru modele mari. |
| `gpt-oss:120b` | 65.4 GB | 116.8B | 131k | tools, thinking | ⚠️ **Se revarsă (63% GPU, 20.6 tok/s).** Există, dar **rulează-l pe `.55`** — acolo face 38.8 tok/s. |
| `gemma4:31b` | 19.9 GB | 31.3B | — | tools, thinking | **Recomandarea de bază pentru chat.** Încape lejer, rapid, are tools + thinking. Punctul de plecare pentru majoritatea task-urilor. |
| `gpt-oss:20b` | 13.8 GB | 20.9B | 131k | tools, thinking | **Cel mai rapid model serios: 143 tok/s.** Ideal pentru chat interactiv și volum mare. Context 131k. Vezi nota despre `reasoning` mai jos. |
| `Qwable-3.6-27b` (hf.co/Mia-AiLab) | 16.6 GB | 26.9B | **262k** | doar completion | **Context uriaș (262k).** Fără tools, fără thinking — doar text-in/text-out. Bun pentru documente foarte lungi. Model comunitar, nu oficial. |
| `deepseek-r1:8b` | 5.2 GB | 8.2B | 131k | thinking | **Mic și rapid, cu raționament.** Bun pentru task-uri logice simple pe volum mare. Fără tools. |

### Vision (imagini)

| Model | Mărime | Params | Context | Rang |
|---|---|---|---|---|
| `qwen3-vl:32b` | 20.9 GB | 33.4B | **262k** | **Cel mai bun vision de pe L40.** Imagini + tools + thinking, context 262k. Prima alegere pentru poze/screenshot-uri/planșe. |
| `glm-ocr:latest` | 2.2 GB | 1.1B | 131k | **Specializat OCR, foarte mic.** Doar pentru extras text din imagini/scanuri. Nu-l folosi ca model de chat. Singurul OCR dedicat din infrastructură. |

### Embeddings (RAG / căutare semantică) — **doar pe `.54`**

Dimensiunile sunt **verificate** prin apel real:

| Model | Mărime | **Dim** | Context | Rang |
|---|---|---|---|---|
| `bge-m3` | 1.16 GB | **1024** | 8k | **Recomandat pentru RAG multilingv.** Excelent pe română, echilibru bun mărime/calitate. Începe cu ăsta. |
| `qwen3-embedding:8b` | 4.68 GB | **4096** | 40k | **Calitate maximă.** Vectori 4096 → index mai mare și căutare mai lentă. Merită doar dacă `bge-m3` nu e suficient. |
| `qwen3-embedding:4b` | 2.50 GB | **2560** | 40k | Compromis între `0.6b` și `8b`. |
| `qwen3-embedding:0.6b` | 0.64 GB | **1024** | 40k | **Cel mai rapid.** Context 40k (mai mult decât bge-m3). Bun pentru volume foarte mari. |
| `nomic-embed-text` | 0.27 GB | **768** | 2k | Vechi, context mic (2k). Folosește-l doar pentru compatibilitate cu indexuri existente. |

> ⚠️ **Nu amesteca modele de embedding.** Un index construit cu `bge-m3` se interoghează **doar** cu `bge-m3`. Schimbarea modelului = reindexare completă.

### Duplicate — ignoră-le

`harrier:0.6b`, `harrier-oss-v1:0.6b` și `hf.co/felipe-cmsa/harrier-oss-v1-0.6b-Q8_0-GGUF:latest` au **același digest** (`310c7d25...`) — sunt același model sub 3 nume. E un embedding 0.6B; `qwen3-embedding:0.6b` sau `bge-m3` sunt alegeri mai bune.

---

## 3. Modele pe 192.168.100.55 (DGX Spark — memorie mare)

**Plafon: ~128 GB unified.** Tot ce e mai jos rulează **100% pe GPU**, fără spill.

| Model | Mărime | Params | Rang |
|---|---|---|---|
| `qwen3.5:122b` | 81.4 GB | 125.1B (MoE) | **Modelul cel mai capabil din toată infrastructura.** 21.2 tok/s, 95.9 GB pe GPU. Nu poate rula nicăieri altundeva. Pentru task-uri unde calitatea contează mai mult decât timpul. Load-ul durează ~47s — ține-l cald dacă îl folosești des. |
| `gpt-oss:120b` | 65.4 GB | 116.8B | **38.8 tok/s — aici e casa lui** (vs. 20.6 tok/s pe L40). Raționament foarte bun, tools + thinking. Cel mai bun raport calitate/viteză pentru modele mari. |
| `qwen2.5vl:72b` | 48.7 GB | 73.4B | **Cel mai puternic model vision.** Pentru imagini complexe unde `qwen3-vl:32b` de pe `.54` nu se descurcă. |
| `qwen3.6:latest` | 23.9 GB | 36.0B (MoE) | **Cel mai nou model din infrastructură.** MoE → rapid raportat la mărime. Nu e pe `.54`. Merită testat ca alternativă la `gemma4:31b`. |
| `qwen3-vl:32b` | 20.9 GB | 33.4B | Identic cu cel de pe `.54` (același digest). **Rulează-l pe `.54`** — e mai rapid acolo. |
| `Qwable-3.6-27b` | 16.6 GB | 26.9B | Identic cu cel de pe `.54`. **Rulează-l pe `.54`.** |
| `gpt-oss:20b` | 13.8 GB | 20.9B | Identic cu cel de pe `.54`. **Rulează-l pe `.54`** — 143 vs. 58 tok/s. |

> **Notă:** `.55` are Ollama **0.18.2** (vs. 0.30.10 pe `.54`). API-ul vechi **nu raportează** `capabilities` și `context_length` în `/api/tags`, dar apelurile funcționează identic. Merită actualizat la un moment dat.

---

## 4. Cum le apelezi

Ollama expune **două API-uri** pe același port:

- **`/api/*`** — API nativ Ollama
- **`/v1/*`** — **compatibil OpenAI** ✅ **Recomandat**: merge cu orice SDK OpenAI existent, doar schimbi `baseURL`. Nu-ți rescrii codul dacă migrezi.

Cheia API e ignorată de Ollama, dar SDK-urile o cer — pune orice string (`"ollama"`).

### 4.1 curl

**Chat (OpenAI-compatible) — forma recomandată:**

```bash
curl http://192.168.100.54:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      {"role": "system", "content": "Esti un asistent util. Raspunzi in romana."},
      {"role": "user", "content": "Rezuma in 3 puncte ce e un deviz de lucrari."}
    ],
    "temperature": 0.7
  }'
```

**Chat (API nativ Ollama):**

```bash
curl http://192.168.100.54:11434/api/chat -d '{
  "model": "gemma4:31b",
  "messages": [{"role": "user", "content": "Salut!"}],
  "stream": false
}'
```

**Model mare pe Spark:**

```bash
curl http://192.168.100.55:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss:120b",
    "messages": [{"role": "user", "content": "Analizeaza riscurile acestui contract..."}]
  }'
```

**Embeddings (doar `.54`):**

```bash
curl http://192.168.100.54:11434/api/embed -d '{
  "model": "bge-m3",
  "input": "factura de utilaje pentru santier"
}'
# -> {"embeddings":[[-0.0338, 0.0345, ...]]}   1024 dimensiuni
```

Mai multe texte deodată (mult mai eficient la indexare):

```bash
curl http://192.168.100.54:11434/api/embed -d '{
  "model": "bge-m3",
  "input": ["primul text", "al doilea text", "al treilea"]
}'
```

**Vision (imagine base64):**

```bash
IMG=$(base64 -i /cale/catre/poza.jpg)
curl http://192.168.100.54:11434/api/generate -d "{
  \"model\": \"qwen3-vl:32b\",
  \"prompt\": \"Ce se vede in aceasta imagine? Descrie in romana.\",
  \"images\": [\"$IMG\"],
  \"stream\": false
}"
```

**OCR:**

```bash
IMG=$(base64 -i /cale/catre/scan.png)
curl http://192.168.100.54:11434/api/generate -d "{
  \"model\": \"glm-ocr\",
  \"prompt\": \"Extrage tot textul din imagine.\",
  \"images\": [\"$IMG\"],
  \"stream\": false
}"
```

**Ce modele sunt disponibile / ce e încărcat acum:**

```bash
curl -s http://192.168.100.54:11434/api/tags     # lista modelelor instalate
curl -s http://192.168.100.54:11434/api/ps       # ce e incarcat in VRAM acum
```

`/api/ps` e util pentru debugging: dacă `size_vram` < `size`, modelul s-a revărsat pe CPU și de-aia e lent.

---

### 4.2 PHP

**Cu SDK-ul OpenAI** (`composer require openai-php/client`) — recomandat:

```php
<?php
require 'vendor/autoload.php';

$client = OpenAI::factory()
    ->withApiKey('ollama')                                  // ignorata, dar obligatorie
    ->withBaseUri('http://192.168.100.54:11434/v1')
    ->make();

$result = $client->chat()->create([
    'model' => 'gemma4:31b',
    'messages' => [
        ['role' => 'system', 'content' => 'Raspunzi concis, in romana.'],
        ['role' => 'user',   'content' => 'Ce e un deviz de lucrari?'],
    ],
]);

echo $result->choices[0]->message->content;
```

**Fără dependințe, cu cURL simplu:**

```php
<?php
function ollamaChat(string $prompt, string $model = 'gemma4:31b', string $host = '192.168.100.54'): string
{
    $ch = curl_init("http://{$host}:11434/api/chat");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 300,          // modelele mari pot dura
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode([
            'model'    => $model,
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'stream'   => false,
        ]),
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        throw new RuntimeException('Eroare cURL: ' . curl_error($ch));
    }
    curl_close($ch);

    $data = json_decode($response, true);
    if (isset($data['error'])) {
        throw new RuntimeException('Eroare Ollama: ' . $data['error']);
    }

    return $data['message']['content'];
}

echo ollamaChat('Explica pe scurt ce e o factura proforma.');

// model mare -> Spark
echo ollamaChat('Analiza detaliata a contractului...', 'gpt-oss:120b', '192.168.100.55');
```

**Embeddings pentru RAG:**

```php
<?php
function ollamaEmbed(array|string $input, string $model = 'bge-m3'): array
{
    $ch = curl_init('http://192.168.100.54:11434/api/embed');   // embeddings doar pe .54
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['model' => $model, 'input' => $input]),
    ]);
    $data = json_decode(curl_exec($ch), true);
    curl_close($ch);

    return $data['embeddings'];   // fiecare vector are 1024 dimensiuni pentru bge-m3
}

// batch — mult mai rapid decat apel per text
$vectors = ollamaEmbed(['prima factura', 'al doilea document', 'al treilea']);
echo count($vectors) . ' vectori, ' . count($vectors[0]) . ' dimensiuni';
```

**Streaming (răspuns afișat pe măsură ce se generează):**

```php
<?php
$ch = curl_init('http://192.168.100.54:11434/api/chat');
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POST       => true,
    CURLOPT_POSTFIELDS => json_encode([
        'model'    => 'gpt-oss:20b',
        'messages' => [['role' => 'user', 'content' => 'Scrie un paragraf despre santiere.']],
        'stream'   => true,
    ]),
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) {
        foreach (explode("\n", trim($chunk)) as $line) {
            if ($line === '') continue;
            $j = json_decode($line, true);
            if (isset($j['message']['content'])) {
                echo $j['message']['content'];
                flush();
            }
        }
        return strlen($chunk);
    },
]);
curl_exec($ch);
curl_close($ch);
```

---

### 4.3 Node.js

**Cu SDK-ul OpenAI** (`npm i openai`) — recomandat:

```js
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'ollama',                                  // ignorata
  baseURL: 'http://192.168.100.54:11434/v1',
});

const res = await client.chat.completions.create({
  model: 'gemma4:31b',
  messages: [
    { role: 'system', content: 'Raspunzi concis, in romana.' },
    { role: 'user', content: 'Ce e un deviz de lucrari?' },
  ],
});

console.log(res.choices[0].message.content);
```

**Streaming:**

```js
const stream = await client.chat.completions.create({
  model: 'gpt-oss:20b',
  messages: [{ role: 'user', content: 'Scrie un paragraf despre santiere.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

**Cu SDK-ul oficial Ollama** (`npm i ollama`):

```js
import { Ollama } from 'ollama';

const l40   = new Ollama({ host: 'http://192.168.100.54:11434' });
const spark = new Ollama({ host: 'http://192.168.100.55:11434' });

// rapid, pe L40
const r1 = await l40.chat({
  model: 'gemma4:31b',
  messages: [{ role: 'user', content: 'Salut!' }],
});
console.log(r1.message.content);

// model mare, pe Spark
const r2 = await spark.chat({
  model: 'gpt-oss:120b',
  messages: [{ role: 'user', content: 'Analiza detaliata...' }],
});
console.log(r2.message.content);
```

**Fără dependințe (fetch nativ, Node 18+):**

```js
async function ollamaChat(prompt, model = 'gemma4:31b', host = '192.168.100.54') {
  const res = await fetch(`http://${host}:11434/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (data.error) throw new Error(`Ollama: ${data.error}`);

  return data.message.content;
}

console.log(await ollamaChat('Explica ce e o factura proforma.'));
```

**Embeddings:**

```js
async function ollamaEmbed(input, model = 'bge-m3') {
  const res = await fetch('http://192.168.100.54:11434/api/embed', {   // doar .54
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  const { embeddings } = await res.json();
  return embeddings;
}

const vectors = await ollamaEmbed(['prima factura', 'al doilea document']);
console.log(`${vectors.length} vectori × ${vectors[0].length} dim`);   // 2 × 1024
```

**Vision:**

```js
import { readFileSync } from 'node:fs';

const image = readFileSync('/cale/catre/poza.jpg').toString('base64');

const res = await fetch('http://192.168.100.54:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen3-vl:32b',
    prompt: 'Descrie imaginea in romana.',
    images: [image],
    stream: false,
  }),
});

console.log((await res.json()).response);
```

**Function calling / tools** (merge pe modelele marcate `tools`):

```js
const res = await client.chat.completions.create({
  model: 'gemma4:31b',
  messages: [{ role: 'user', content: 'Cat e cursul EUR azi?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_exchange_rate',
      description: 'Returneaza cursul valutar curent',
      parameters: {
        type: 'object',
        properties: { currency: { type: 'string', description: 'ex: EUR, USD' } },
        required: ['currency'],
      },
    },
  }],
});

console.log(res.choices[0].message.tool_calls);
```

---

## 5. Lucruri de știut înainte să începi

**Modelele `thinking` returnează raționamentul separat.** La `gpt-oss:20b`, `gpt-oss:120b`, `gemma4:31b`, `qwen3-vl:32b`, `deepseek-r1:8b`, răspunsul final e în `content`, iar procesul de gândire într-un câmp separat `reasoning`. Am pățit-o în testare: `content` părea gol, dar era doar scurt (`"Salut"`) în timp ce `reasoning` avea un paragraf întreg. **Citește `content`, nu concatena `reasoning` în răspunsul către utilizator.**

**Primul apel e lent.** Load-ul modelului din disc în VRAM durează ~7s pentru modelele mici, **47s pentru `qwen3.5:122b`**. Apelurile următoare sunt instantanee cât timp modelul stă încărcat. Ollama îl descarcă după 5 min de inactivitate — folosește `"keep_alive": "30m"` în request dacă vrei să-l ții cald:

```bash
curl http://192.168.100.54:11434/api/chat -d '{
  "model": "gemma4:31b",
  "messages": [{"role":"user","content":"Salut"}],
  "keep_alive": "30m"
}'
```

**Pune timeout generos.** Default-urile de 30s din multe librării HTTP sunt insuficiente. Minim 300s pentru modele mari.

**Verifică dacă modelul s-a revărsat pe CPU.** Dacă un răspuns e neașteptat de lent, `curl -s http://IP:11434/api/ps` — dacă `size_vram` < `size`, ai spill. Mută-te pe celălalt server sau alege un model mai mic.

**Contextul lung costă memorie.** Un model cu context 262k nu înseamnă că poți trimite 262k tokeni gratis — KV cache-ul crește cu lungimea contextului și mănâncă din VRAM, ceea ce poate împinge modelul în spill. Pe `.54`, cu plafon 43 GB, contextul lung contează.

**Nu amesteca modele de embedding între indexuri.** Vezi nota din secțiunea 2.

---

## 6. Rezumat: de unde începi

| Vrei să... | Model | Server |
|---|---|---|
| Chat general, echilibrat | `gemma4:31b` | `.54` |
| Cel mai rapid (143 tok/s) | `gpt-oss:20b` | `.54` |
| Calitate maximă | `qwen3.5:122b` | `.55` |
| Calitate mare + viteză rezonabilă | `gpt-oss:120b` | `.55` |
| RAG / căutare semantică | `bge-m3` (1024 dim) | `.54` |
| Imagini | `qwen3-vl:32b` | `.54` |
| Imagini complexe | `qwen2.5vl:72b` | `.55` |
| OCR / scanuri | `glm-ocr` | `.54` |
| Documente foarte lungi | `Qwable-3.6-27b` (262k) | `.54` |

**Dacă nu știi ce să alegi: `gemma4:31b` pe `.54`.** De acolo urci sau cobori după nevoie.

---

*Măsurători efectuate pe 17 iulie 2026. Listele de modele se pot schimba — verifică cu `curl -s http://192.168.100.54:11434/api/tags`.*
