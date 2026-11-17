const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const OUT = path.join(__dirname, '三国演义.html');
const src = fs.readFileSync(OUT, 'utf8');

const PUNCT = '，。！？；：、…—“”‘’《》·（）「」【】〈〉';

/* ---- 1. anchors ---- */
const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const idset = new Set(ids);
const hrefs = [...src.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
const broken = hrefs.filter(h => !idset.has(h));
console.log('[anchors] ids', idset.size, '| links', hrefs.length, '| broken', broken.length, broken.slice(0, 8));
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
console.log('[ids] duplicates', dup.length, [...new Set(dup)].slice(0, 8));

/* ---- 2. word spans ---- */
const WORD_RE = /<span class="word" data-pinyin="([^"]*)"><span class="pinyin">([^"<]*)<\/span>([^<]*)<\/span>/g;
const words = [...src.matchAll(WORD_RE)];
console.log('[words] word tags', (src.match(/class="word"/g) || []).length, '| parsed', words.length);
console.log('[words] empty pinyin', words.filter(w => !w[1].trim()).length,
  '| pinyin!=attr', words.filter(w => w[1] !== w[2]).length,
  '| empty char', words.filter(w => !w[3].trim()).length);

/* ---- 3. punct spans ---- */
const puncts = [...src.matchAll(/<span class="punct">([^<]*)<\/span>/g)].map(m => m[1]);
const multiPunct = puncts.filter(p => [...p].length !== 1);
const badPunct = puncts.filter(p => ![...p].every(c => PUNCT.includes(c)));
console.log('[punct] spans', puncts.length, '| multi-char', multiPunct.length, '| non-punct', badPunct.length, [...new Set(badPunct)].slice(0, 5));
console.log('[punct] multi-char values', [...new Set(multiPunct)]);

/* ---- 4. source vs rendered text, chapter by chapter ---- */
const SOURCES = fs.readdirSync(DIR)
  .filter(f => /^ch\d+(-\d+)?\.html$/i.test(f))
  .sort((a, b) => parseInt(a.match(/^ch(\d+)/i)[1], 10) - parseInt(b.match(/^ch(\d+)/i)[1], 10));

function sourceTexts() {
  const out = [];
  for (const f of SOURCES) {
    const t = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = t.match(/const SENTENCES = (\[[\s\S]*?\n\]);/);
    const data = new Function('return ' + m[1])();
    for (const b of data) {
      if (b.type === 'title') out.push(b.zh);
      else b.sentences.forEach(s => out.push(s.zh));
    }
  }
  return out;
}

const clean = zh => zh.split(/\s+/).filter(Boolean).map(t => {
  if (t.includes('RAW')) {                                  // 那一处转义残留，按修复后的文本比对
    const head = t.slice(0, t.indexOf('RAW'));
    const hit = t.slice(t.indexOf('RAW') + 3).match(/[\u3400-\u9fff]/g);
    return head + (hit ? hit[hit.length - 1] : '');
  }
  if (!t.includes('|')) return t;                          // 标点
  return t.slice(0, t.indexOf('|'));
}).join('').replace(/[，。！？；：、…—“”‘’《》·（）「」【】〈〉]/g, '');

const srcText = sourceTexts().map(clean).join('');

/* rendered: strip the cover (which holds the demo word), keep only chapters */
const bodyStart = src.indexOf('<section class="chapter"');
const book = src.slice(bodyStart, src.indexOf('<div class="book-end"'));
let outText = '';
for (const m of book.matchAll(WORD_RE)) outText += m[3];
for (const m of book.matchAll(/<span class="punct">([^<]*)<\/span>/g)) outText += m[1];
outText = outText.replace(/[，。！？；：、…—“”‘’《》·（）「」【】〈〉]/g, '');

console.log('[text] source chars', srcText.length, '| rendered chars', outText.length);
if (srcText === outText) console.log('[text] IDENTICAL ✔');
else {
  let i = 0; while (i < Math.min(srcText.length, outText.length) && srcText[i] === outText[i]) i++;
  console.log('[text] MISMATCH at', i);
  console.log('   src :', JSON.stringify(srcText.slice(Math.max(0, i - 25), i + 25)));
  console.log('   out :', JSON.stringify(outText.slice(Math.max(0, i - 25), i + 25)));
}

/* ---- 5. hazards ---- */
console.log('[haz] RAW:', (src.match(/RAW/g) || []).length,
  '| &quot;:', (src.match(/&quot;/g) || []).length,
  '| size KB:', (Buffer.byteLength(src, 'utf8') / 1024).toFixed(1));

/* ---- 6. per-chapter sanity ---- */
const secs = [...src.matchAll(/<section class="chapter[^"]*" id="(ch\d+)" data-num="(\d+)">/g)];
console.log('[chapters]', secs.length, secs.map(s => s[2]).join(','));
