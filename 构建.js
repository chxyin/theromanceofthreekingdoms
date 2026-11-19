/* ============================================================
   编译器：把 ch*.html 合成一本电子书
   目录里出现的 chN.html（或 chN-M.html 合并文件）会自动收进来，
   以后补上第五回或第二十一回，重跑一次即可。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;    // 章节源文件就在本文件夹里
const OUTDIR = __dirname; // 成品也输出到这里，整个文件夹可以随便搬
const OUT = path.join(OUTDIR, '三国演义.html');

/* 源文件：自动发现，文件名形如「第01回-宴桃园豪杰三结义.html」，按回数排序 */
const CHAPTER_RE = /^第(\d+)回.*\.html$/;
const SOURCES = fs.readdirSync(DIR)
  .filter(f => CHAPTER_RE.test(f))
  .sort((a, b) => parseInt(a.match(CHAPTER_RE)[1], 10) - parseInt(b.match(CHAPTER_RE)[1], 10));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 读取数据 ---------- */
function loadBlocks(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const m = src.match(/const SENTENCES\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('无法在 ' + file + ' 中找到 SENTENCES');
  const blocks = new Function('return ' + m[1])();
  const navMatch = src.match(/<nav class="jumpbar">([\s\S]*?)<\/nav>/);
  const nav = navMatch
    ? [...navMatch[1].matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map(x => ({ href: x[1], label: x[2] }))
    : [];
  return { blocks, nav };
}

/* ---------- 组装章节 ---------- */
const chapters = [];
let fixedTokens = 0;

function normalizeZh(zh) {
  // 原文 ch1-4.html 有一个被写坏的 token：`。RAW他">他`
  // （生成时的转义残留，屏幕上会直接显示 “RAW他">他”）。这里还原为 “。” + “他|tā”。
  const tokens = zh.split(/\s+/).filter(Boolean);
  return tokens.map(t => {
    if (t.includes('RAW') && !t.includes('|')) {
      fixedTokens++;
      const head = t.slice(0, t.indexOf('RAW'));
      const tail = t.slice(t.indexOf('RAW') + 3).replace(/^[^"]*"/, '');
      const hit = tail.match(/[\u3400-\u9fff]/);
      const ch = hit ? hit[0] : '他';
      return head + ' ' + ch + '|' + 'tā';
    }
    return t;
  }).join(' ').replace(/\s+/g, ' ').trim();
}

for (const file of SOURCES) {
  const { blocks, nav } = loadBlocks(file);
  const titles = blocks.filter(b => b.type === 'title');

  if (titles.length > 1) {
    /* 一个文件里装了好几回（例如 ch1-4.html），按 title 块切开 */
    let cur = null;
    for (const b of blocks) {
      if (b.type === 'title') {
        cur = { num: parseInt(String(b.id).replace(/\D/g, ''), 10), titleZh: normalizeZh(b.zh), titleEn: b.en, paras: [], sections: [] };
        chapters.push(cur);
      } else if (b.type === 'para' && cur) {
        cur.paras.push({ id: b.id || null, sentences: b.sentences.map(s => ({ zh: normalizeZh(s.zh), en: s.en })) });
      }
    }
  } else {
    const num = parseInt(file.match(CHAPTER_RE)[1], 10);
    const title = titles[0];
    const paras = blocks.filter(b => b.type === 'para')
      .map(b => ({ id: b.id || null, sentences: b.sentences.map(s => ({ zh: normalizeZh(s.zh), en: s.en })) }));
    chapters.push({ num, titleZh: normalizeZh(title.zh), titleEn: title.en, paras, sections: nav });
  }
}

chapters.sort((a, b) => a.num - b.num);

/* ---------- token -> html（与原文件一致的机制） ---------- */
const PUNCT = '，。！？；：、…—“”‘’《》·（）「」【】〈〉';
const PUNCT_RE = new RegExp('[' + PUNCT + ']');
const OPEN_RE = /[“‘（《「『【〈]/;

const wordHtml = (ch, py) =>
  '<span class="word" data-pinyin="' + esc(py) + '">' +
  '<span class="pinyin">' + esc(py) + '</span>' + esc(ch) + '</span>';

const punctHtml = p => '<span class="punct' + (p === '·' ? ' dot' : '') + '">' + esc(p) + '</span>';

/* 把粘在字上的标点拆出来：`，朝|cháo` -> `，` + `朝|cháo`。
   源文件两种写法混用，不拆的话标点会变成可点字，还会被挤到行首。 */
function splitToken(t) {
  if (!t.includes('|')) return t.startsWith('RAW') ? [[t.slice(3), null]] : [[null, t]];
  const i = t.indexOf('|');
  let ch = t.slice(0, i);
  const py = t.slice(i + 1);
  const out = [];
  while (ch.length && PUNCT_RE.test(ch[0])) { out.push([null, ch[0]]); ch = ch.slice(1); }
  const tail = [];
  while (ch.length && PUNCT_RE.test(ch[ch.length - 1])) { tail.unshift([null, ch[ch.length - 1]]); ch = ch.slice(0, -1); }
  if (ch) out.push([ch, py]);
  return out.concat(tail);
}

/* 渲染一句：标点用 nowrap 的 .seg 带住前一个字，行首不会再出现“，”。 */
function renderZh(zh) {
  const items = [];
  for (const t of zh.split(/\s+/).filter(Boolean)) {
    for (const it of splitToken(t)) items.push(it);
  }

  let html = '', buf = '', pending = '';
  const flush = () => { if (buf) { html += '<span class="seg">' + buf + '</span>'; buf = ''; } };

  for (const [w, p] of items) {
    if (w) {
      flush();
      buf = pending + wordHtml(w, p);
      pending = '';
    } else if (p !== null) {
      if (OPEN_RE.test(p)) { pending += punctHtml(p); }
      else if (buf) { buf += punctHtml(p); }
      else { pending += punctHtml(p); }
    }
  }
  flush();
  return html + pending;
}

/* 去掉拼音，只留汉字（用于目录） */
const plainZh = zh => zh.split(/\s+/).filter(Boolean)
  .map(t => t.includes('|') ? t.slice(0, t.indexOf('|')) : (t.startsWith('RAW') ? '' : t))
  .join('');

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function toCn(n) {
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
}

/* ---------- 统计 ---------- */
let nParas = 0, nSent = 0, nWords = 0;
const countTokens = zh => {
  let n = 0;
  for (const t of zh.split(/\s+/).filter(Boolean)) {
    for (const [w] of splitToken(t)) if (w) n++;
  }
  return n;
};
for (const c of chapters) {
  nWords += countTokens(c.titleZh);
  nParas += c.paras.length;
  for (const p of c.paras) {
    nSent += p.sentences.length;
    for (const s of p.sentences) nWords += countTokens(s.zh);
  }
}

/* ---------- 目录 ---------- */
const gapLabel = (from, to) => {
  const names = [];
  for (let n = from; n <= to; n++) names.push('第' + toCn(n) + '回');
  return names.join('、');
};

let toc = '';
chapters.forEach((c, idx) => {
  const full = plainZh(c.titleZh);
  const short = full.split('·')[0].trim();
  const chId = 'ch' + c.num;
  toc += '<div class="toc-item" data-ch="' + chId + '">'
    + '<a class="toc-ch" href="#' + chId + '" title="' + esc(full) + '">'
    + '<span class="toc-num">第' + toCn(c.num) + '回</span>'
    + '<span class="toc-t">' + esc(short) + '</span></a>';
  if (c.sections.length) {
    toc += '<div class="toc-secs">';
    c.sections.forEach((s, i) => {
      const sid = chId + '-s' + (i + 1);
      toc += '<a class="toc-sec" href="#' + sid + '" data-target="' + sid + '">'
        + '<span class="toc-secn">' + c.num + '.' + (i + 1) + '</span>' + esc(s.label) + '</a>';
    });
    toc += '</div>';
  }
  toc += '</div>';
  const next = chapters[idx + 1];
  if (next && next.num > c.num + 1) {
    toc += '<div class="toc-missing">' + gapLabel(c.num + 1, next.num - 1) + ' · 未收录</div>';
  }
});

/* ---------- 正文 ---------- */
let body = '';
chapters.forEach((c, idx) => {
  const chId = 'ch' + c.num;
  const full = plainZh(c.titleZh);
  const short = full.split('·')[0].trim();

  let chips = '';
  if (c.sections.length) {
    chips = '<div class="chips">' + c.sections.map((s, i) =>
      '<a href="#' + chId + '-s' + (i + 1) + '">' + esc(s.label) + '</a>').join('') + '</div>';
  }

  let ps = '';
  c.paras.forEach((p, i) => {
    const pid = chId + '-' + (p.id || ('p' + (i + 1)));
    ps += '<div class="paragraph" id="' + pid + '">' + p.sentences.map(s =>
      '<div class="sentence"><span class="zh-line">' + renderZh(s.zh) + '</span>'
      + '<span class="eng-line">' + esc(s.en) + '</span></div>').join('') + '</div>';
  });

  const prev = chapters[idx - 1];
  const contiguous = prev && prev.num === c.num - 1;

  if (prev && !contiguous) {
    body += '<div class="gap-note">' + gapLabel(prev.num + 1, c.num - 1) + ' · 未收录</div>';
  }

  body += '<section class="chapter' + (contiguous ? ' sep' : '') + '" id="' + chId + '" data-num="' + c.num + '">'
    + '<div class="ch-num">第' + toCn(c.num) + '回</div>'
    + '<h2 class="chapter-title">' + renderZh(c.titleZh)
    + '<span class="eng-title">' + esc(c.titleEn) + '</span></h2>'
    + chips + ps + '</section>';
});

const CSS = fs.readFileSync(path.join(DIR, '样式.css'), 'utf8');
const JS = fs.readFileSync(path.join(DIR, '交互.js'), 'utf8');

/* 回目范围与缺口（用于封面与简介） */
const firstNum = chapters[0].num;
const lastNum = chapters[chapters.length - 1].num;
const missingNums = [];
for (let n = firstNum; n <= lastNum; n++) if (!chapters.some(c => c.num === n)) missingNums.push(n);
const rangeText = '第' + toCn(firstNum) + '回 – 第' + toCn(lastNum) + '回' +
  (missingNums.length ? '（缺' + missingNums.map(n => '第' + toCn(n) + '回').join('、') + '）' : '');

const cover = `
    <header class="cover" id="cover">
      <div class="cover-zh">三国演义</div>
      <div class="cover-en">Romance of the Three Kingdoms</div>
      <div class="cover-sub">${rangeText} · 简体 · 逐字拼音 · 英译</div>
      <div class="cover-stats">${chapters.length} 回 · ${nParas} 段 · ${nSent} 句 · ${nWords.toLocaleString('en-US')} 字</div>
      <div class="howto">
        <b>点击任意汉字</b> → 顶部浮出该字拼音（再点一次收起）；<b>点击空白处</b> → 全部收起。<br>
        想整页都带拼音？把右上角 <b>「拼音 · 点按」</b> 切成 <b>「拼音 · 全显」</b>——<span class="word" data-pinyin="shì"><span class="pinyin">shì</span>试</span>一下。<br>
        用鼠标的话，打开右上角 <b>「悬停」</b>，指到哪个字就读哪个字。
      </div>
    </header>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>三国演义 · Romance of the Three Kingdoms</title>
<meta name="description" content="三国演义 第一回至第十六回（缺第五回），逐字拼音 + 英译，可离线阅读的电子书。">
<style>
${CSS}
</style>
</head>
<body>

<div class="scrim" id="scrim"></div>

<aside class="side" id="side">
  <div class="brand">
    <div class="brand-zh">三国演义</div>
    <div class="brand-en">Three Kingdoms</div>
  </div>
  <nav class="toc" id="toc">
${toc}
  </nav>
  <div class="side-foot">
    点击汉字 → 显示拼音<br>
    Esc 或点空白 → 全部收起
  </div>
</aside>

<div class="main">
  <div class="topbar">
    <button class="iconbtn" id="menuBtn" aria-label="目录">☰</button>
    <div class="topinfo" id="topCh">${esc('第' + toCn(chapters[0].num) + '回 · ' + plainZh(chapters[0].titleZh).split('·')[0].trim())}</div>
    <div class="tools">
      <button class="tbtn" id="pyBtn" aria-pressed="false">拼音 · 点按</button>
      <button class="tbtn" id="hoverBtn" aria-pressed="false">悬停 · 关</button>
      <button class="tbtn" id="enBtn" aria-pressed="false">英译 · 显示</button>
      <button class="tbtn fs" id="fsMinus" aria-label="缩小字号">A−</button>
      <button class="tbtn fs" id="fsPlus" aria-label="放大字号">A+</button>
    </div>
    <div class="bar"><i id="bar"></i></div>
  </div>

  <article class="book" id="book">
${cover}
${body}
    <div class="book-end">
      —— 全书至此 · 共 ${chapters.length} 回 ——<br>
      <a class="to-top" href="#cover">↑ 回到卷首</a>
    </div>
  </article>
</div>

<script>
${JS}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
/* GitHub Pages 的入口：同一份内容，另存为 index.html，
   这样 https://<user>.github.io/theromanceofthreekingdoms/ 直接就是这本书 */
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html, 'utf8');

console.log('written:', OUT);
console.log('written:', path.join(OUTDIR, 'index.html'));
console.log('size:', (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB');
console.log('chapters:', chapters.length, '(' + chapters.map(c => c.num).join(',') + ')');
console.log('paras:', nParas, 'sentences:', nSent, 'words:', nWords);
console.log('repaired tokens:', fixedTokens);
console.log('gap notes:', (html.match(/class="gap-note"/g) || []).length);
