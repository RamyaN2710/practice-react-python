/* =========================================================
   React Course — slide deck engine
   Markup contract (see any class-XX.html):
     <body class="deck" data-class="1" data-title="..." data-duration="60">
       <main class="slides">
         <section class="slide" data-title="Short name"> ... <aside class="notes">...</aside></section>
   Widgets: .step, script[type=text/x-code], .playground, .quiz, .flip,
            .tabs > .tab[data-label], .explorer, .spoiler, .react-logo
   Custom demos: listen for the "enter" event on a slide.
   ========================================================= */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- Theme ---------- */
  const prefersLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
  let theme = store.get('rc-theme', prefersLight ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    store.set('rc-theme', theme);
  }

  /* ---------- Helpers ---------- */
  function dedent(text) {
    // "<\/script>" lets a code sample show a closing script tag
    const lines = text.replace(/<\\\/script>/g, '</script>').replace(/\t/g, '  ').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indents = lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(min)).join('\n');
  }

  const KW = 'const|let|var|function|return|import|export|default|from|if|else|for|of|in|async|await|try|catch|finally|new|true|false|null|undefined|typeof|while|switch|case|break|class|extends';
  const RE_JS = new RegExp(
    '(\\/\\/.*$|\\/\\*.*?\\*\\/|\\{\\/\\*.*?\\*\\/\\})' +              // 1 comment
    '|("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' + // 2 string
    '|(<\\/?[A-Za-z][\\w.]*|\\/?>)' +                                      // 3 tag
    '|\\b(' + KW + ')\\b' +                                                // 4 keyword
    '|\\b(\\d+(?:\\.\\d+)?)\\b' +                                          // 5 number
    '|([A-Za-z_$][\\w$-]*)(?==[^=>])' +                                     // 6 attribute
    '|([A-Za-z_$][\\w$]*)(?=\\s*\\()' +                                     // 7 function call
    '|([{}])', 'g');                                                       // 8 brace
  const CLS_JS = [null, 't-com', 't-str', 't-tag', 't-kw', 't-num', 't-attr', 't-fn', 't-brace'];
  const RE_CSS = /(\/\*.*?\*\/)|("[^"]*"|'[^']*')|(#[\da-fA-F]{3,8}\b|-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|fr|deg)?)|([\w-]+)(?=\s*:)|([.#]?[\w-]+)(?=[^;{}]*\{)|([{}])/g;
  const CLS_CSS = [null, 't-com', 't-str', 't-num', 't-prop', 't-tag', 't-brace'];
  const KW_PY = 'def|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|class|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|nonlocal|async|await|del|assert|self';
  const RE_PY = new RegExp(
    '(#.*$)' +                                                             // 1 comment
    '|([rbfuRBFU]{0,2}(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'))' + // 2 string
    '|(@[\\w.]+)' +                                                        // 3 decorator
    '|\\b(' + KW_PY + ')\\b' +                                             // 4 keyword
    '|\\b(\\d+(?:\\.\\d+)?)\\b' +                                          // 5 number
    '|([A-Za-z_]\\w*)(?=\\s*\\()', 'g');                                   // 6 function call
  const CLS_PY = [null, 't-com', 't-str', 't-tag', 't-kw', 't-num', 't-fn'];

  function tokenize(line, re, cls) {
    let out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      out += esc(line.slice(last, m.index));
      const g = m.findIndex((v, i) => i > 0 && v !== undefined);
      out += `<span class="${cls[g]}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(line.slice(last));
  }
  function hlLine(line, lang) {
    if (lang === 'bash' || lang === 'terminal') {
      if (/^\s*#/.test(line)) return `<span class="t-com">${esc(line)}</span>`;
      const m = line.match(/^(\s*[$>]\s)(.*)$/);
      if (m) return `<span class="t-prompt">${esc(m[1])}</span><span class="t-fn">${esc(m[2])}</span>`;
      return `<span class="t-str">${esc(line)}</span>`;
    }
    if (lang === 'text') return esc(line);
    if (lang === 'css') return tokenize(line, RE_CSS, CLS_CSS);
    if (lang === 'python' || lang === 'py') return tokenize(line, RE_PY, CLS_PY);
    return tokenize(line, RE_JS, CLS_JS);
  }
  function highlight(code, lang) { return code.split('\n').map(l => hlLine(l, lang)).join('\n'); }

  function parseRanges(spec) {
    const set = new Set();
    (spec || '').split(',').map(s => s.trim()).filter(Boolean).forEach(p => {
      const [a, b] = p.split('-').map(Number);
      for (let i = a; i <= (b || a); i++) set.add(i);
    });
    return set;
  }

  /* ---------- Code blocks ---------- */
  function buildCode(el) {
    const code = dedent(el.textContent);
    const lang = el.dataset.lang || 'jsx';
    const hl = parseRanges(el.dataset.hl);
    const box = document.createElement('div');
    box.className = 'code ' + (el.className || '');
    const file = el.dataset.file || (lang === 'bash' ? 'Terminal' : '');
    const lines = code.split('\n').map((l, i) => {
      const cls = hl.size ? (hl.has(i + 1) ? ' hl' : (el.dataset.dim !== undefined ? ' dim' : '')) : '';
      return `<span class="line${cls}">${hlLine(l, lang) || ' '}</span>`;
    }).join('');
    box.innerHTML = `<div class="code-head"><span class="dots"><i></i><i></i><i></i></span><span class="file">${esc(file)}</span><button class="mini-btn copy" type="button">Copy</button></div><pre><code>${lines}</code></pre>`;
    $('.copy', box).addEventListener('click', e => {
      const b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(
        () => { b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy'), 1400); },
        () => { b.textContent = 'Select & copy'; });
    });
    el.replaceWith(box);
  }

  /* ---------- Live React playground ---------- */
  const LIBS = [
    'https://unpkg.com/react@18.3.1/umd/react.development.js',
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
    'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js'
  ];
  const BASE_CSS = `
    *{box-sizing:border-box} body{margin:0;padding:20px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#f8fafc;line-height:1.5}
    h1,h2,h3{margin:.2em 0 .4em;line-height:1.2} p{margin:.3em 0 .8em}
    button{font:inherit;font-weight:600;background:#2563eb;color:#fff;border:0;padding:9px 16px;border-radius:10px;cursor:pointer;margin:4px 6px 4px 0;transition:.15s}
    button:hover{filter:brightness(1.12);transform:translateY(-1px)} button:disabled{opacity:.5;cursor:not-allowed;transform:none}
    input,select,textarea{font:inherit;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#1e293b}
    input:focus,select:focus,textarea:focus{outline:2px solid #61dafb;border-color:transparent}
    label{font-weight:600;font-size:.92rem} a{color:#2563eb}
    .card{background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 6px 22px rgba(15,23,42,.08);margin-bottom:14px}
    .__err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:14px;border-radius:12px;white-space:pre-wrap;font:13px/1.5 Consolas,monospace}
  `;
  let pgCounter = 0;

  function consoleHook(id) {
    return `(function(){var ID=${id};function ser(x){if(typeof x==='string')return x;if(x===undefined)return 'undefined';if(typeof x==='function')return 'ƒ '+(x.name||'anonymous')+'()';if(x instanceof Error)return x.name+': '+x.message;if(x&&x.nodeType)return '<'+x.nodeName.toLowerCase()+'>';try{return JSON.stringify(x)}catch(e){return String(x)}}
['log','info','warn','error','table'].forEach(function(k){var o=console[k];console[k]=function(){var a=[].slice.call(arguments).map(ser);try{parent.postMessage({__pg:ID,k:k==='table'?'log':k,a:a},'*')}catch(e){}if(o)o.apply(console,arguments)}})})();`;
  }

  // Plain JavaScript mode: optional HTML + script, output goes to the console panel
  function buildJsDoc(code, css, html, id) {
    const payload = JSON.stringify(code).replace(/</g, '\u003c');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style>
<script>${consoleHook(id)}
window.onerror=function(m){console.error(String(m).replace(/^Uncaught /,''));};<\/script>
</head><body>${html}<script>
try{new Function(${payload})();}catch(e){console.error(e.name+': '+e.message);}
<\/script></body></html>`;
  }

  function buildDoc(code, css, id) {
    const clean = code
      .replace(/^\s*import\s.*$/gm, '')
      .replace(/export\s+default\s+(?=function|class)/g, '')
      .replace(/^\s*export\s+default\s+\w+;?\s*$/gm, '')
      .replace(/^(\s*)export\s+/gm, '$1');
    const payload = JSON.stringify(clean).replace(/</g, '\\u003c');
    const prelude = 'const {useState,useEffect,useRef,useMemo,useCallback,useReducer,useContext,createContext,Fragment}=React;\\n';
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style>
<script>
${consoleHook(id)}
window.__showErr=function(m){var r=document.getElementById('root');r.innerHTML='<pre class="__err"></pre>';r.firstChild.textContent='⚠️ '+m};
window.onerror=function(m){window.__showErr(String(m).replace(/^Uncaught /,''));};
<\/script>
${LIBS.map(s => `<script src="${s}"><\/script>`).join('')}
</head><body><div id="root"></div><script>
if(!window.React||!window.Babel){window.__showErr('Could not load React from the internet.\\nCheck the connection and press ▶ Run again.');}
else{try{var out=Babel.transform(${payload},{presets:['react']}).code;
new Function('React','ReactDOM',"${prelude}"+out+"\\n;if(typeof App!=='undefined'){ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));}")(React,ReactDOM);}
catch(e){window.__showErr(e.message);}}
<\/script></body></html>`;
  }

  function fmtArgs(a) {
    if (typeof a[0] === 'string' && a[0].includes('%s')) {
      let i = 1; const first = a[0].replace(/%s/g, () => a[i++] ?? '');
      return [first, ...a.slice(i)].join(' ').replace(/%c/g, '');
    }
    return a.join(' ');
  }

  // Python mode: Pyodide (real CPython in the browser), loaded once on first run
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  let pyReady = null;
  function loadPy() {
    if (!pyReady) {
      pyReady = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = PYODIDE + 'pyodide.js';
        s.onload = () => window.loadPyodide({ indexURL: PYODIDE }).then(res, rej);
        s.onerror = () => rej(new Error('Could not load Python from the internet. Check the connection and press ▶ Run again.'));
        document.head.appendChild(s);
      });
      pyReady.catch(() => { pyReady = null; });
    }
    return pyReady;
  }
  let pyQueue = Promise.resolve();
  function runPython(code, out) {
    pyQueue = pyQueue.then(async () => {
      let py;
      if (!window.__pyLoaded) out('info', '⏳ Starting Python… (only the first time, ~5 sec)');
      try { py = await loadPy(); } catch (e) { out('error', e.message); return; }
      if (!window.__pyLoaded) { window.__pyLoaded = true; out('clear'); }
      py.setStdout({ batched: s => out('log', s) });
      py.setStderr({ batched: s => out('error', s) });
      py.setStdin({ stdin: () => window.prompt('Python is asking for input():') ?? '' });
      const g = py.toPy({});
      g.set('__name__', '__main__');
      try { await py.runPythonAsync(code, { globals: g }); }
      catch (e) {
        const msg = String(e.message || e);
        const lines = [...msg.matchAll(/File "<exec>", line (\d+)/g)];
        const last = msg.trim().split('\n').pop();
        out('error', (lines.length ? 'Line ' + lines[lines.length - 1][1] + ' → ' : '') + last);
      } finally { g.destroy(); }
    });
    return pyQueue;
  }

  const playgrounds = new Map();
  function buildPlayground(pg) {
    const src = $('script[type="text/x-playground"]', pg);
    const cssEl = $('script[type="text/x-playground-css"]', pg);
    const htmlEl = $('script[type="text/x-playground-html"]', pg);
    const jsMode = pg.dataset.mode === 'js';
    const pyMode = pg.dataset.mode === 'py';
    const html = htmlEl ? dedent(htmlEl.textContent) : '';
    const consoleOnly = (jsMode && !html) || pyMode;
    const original = dedent(src ? src.textContent : pyMode ? 'print("Hello, World!")' : (jsMode ? 'console.log("Hello, World!");' : 'function App() {\n  return <h1>Hello React!</h1>;\n}'));
    const css = cssEl ? cssEl.textContent : '';
    const id = ++pgCounter;
    pg.style.setProperty('--pg-h', (pg.dataset.height || 400) + 'px');
    pg.innerHTML = `
      <div class="pg-editor">
        <div class="pg-bar"><span class="dots"><i></i><i></i><i></i></span><span class="file">${esc(pg.dataset.file || (pyMode ? 'main.py' : jsMode ? 'script.js' : 'App.jsx'))}</span>
          <span class="pg-status">● Live</span>
          <button class="mini-btn" data-pg="reset" title="Back to the original code">↺ Reset</button>
          <button class="mini-btn" data-pg="run" title="Run (Ctrl+Enter)">▶ Run</button></div>
        <div class="pg-code"><pre aria-hidden="true"></pre><textarea spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off" aria-label="Code editor"></textarea></div>
      </div>
      <div class="pg-preview">
        <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">${esc(pg.dataset.url || (pyMode ? 'Terminal — python main.py' : consoleOnly ? 'Console output' : jsMode ? 'index.html' : 'http://localhost:5173/'))}</span></div>
        <iframe sandbox="allow-scripts allow-modals" title="Live preview"></iframe>
        <div class="pg-console"><div class="c-head"><span>${pyMode ? 'Output' : 'Console'}</span><button type="button">clear</button></div><div class="c-body"></div></div>
      </div>`;
    const ta = $('textarea', pg), pre = $('pre', pg), frame = $('iframe', pg), status = $('.pg-status', pg);
    const cons = $('.pg-console', pg), cbody = $('.c-body', cons);
    if (consoleOnly) pg.classList.add('console-only');
    ta.value = original;
    const paint = () => { pre.innerHTML = highlight(ta.value, pyMode ? 'python' : 'jsx') + '\n '; pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; };
    const usesInput = () => pyMode && /\binput\s*\(/.test(ta.value);
    const run = () => {
      cbody.innerHTML = ''; cons.classList.remove('has');
      status.textContent = '● Live'; status.classList.remove('busy');
      if (pyMode) {
        status.textContent = '● Running…';
        runPython(ta.value, (k, text) => {
          if (k === 'clear') { cbody.innerHTML = ''; return; }
          addLine({ cbody, cons }, k, text);
        }).then(() => { status.textContent = '● Live'; });
        return;
      }
      frame.srcdoc = jsMode ? buildJsDoc(ta.value, css, html, id) : buildDoc(ta.value, css, id);
    };
    let t;
    ta.addEventListener('input', () => {
      paint(); clearTimeout(t);
      // programs that call input() only run on ▶ Run, so typing doesn't pop up prompts
      if (usesInput()) { status.textContent = '● Press ▶ Run'; status.classList.add('busy'); return; }
      status.textContent = '● Typing…'; status.classList.add('busy'); t = setTimeout(run, pyMode ? 1000 : 800);
    });
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.setRangeText(pyMode ? '    ' : '  ', s, ta.selectionEnd, 'end'); paint();
      } else if (pyMode && e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        // keep the indentation, and indent one more level after a ':'
        e.preventDefault();
        const s = ta.selectionStart, before = ta.value.slice(0, s);
        const cur = before.slice(before.lastIndexOf('\n') + 1);
        const ind = cur.match(/^ */)[0] + (/:\s*$/.test(cur) ? '    ' : '');
        ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); clearTimeout(t); run(); }
    });
    $('[data-pg="run"]', pg).onclick = () => { clearTimeout(t); run(); };
    $('[data-pg="reset"]', pg).onclick = () => { ta.value = original; paint(); run(); };
    $('.c-head button', cons).onclick = () => { cbody.innerHTML = ''; cons.classList.remove('has'); };
    paint();
    playgrounds.set(id, { run, started: false, pg, cbody, cons, manual: usesInput() });
    pg.dataset.pgId = id;
  }
  function addLine(p, k, text) {
    const line = document.createElement('div');
    line.className = 'l ' + k;
    line.textContent = (k === 'warn' ? '⚠ ' : k === 'error' ? '✖ ' : '› ') + text;
    p.cbody.appendChild(line); p.cons.classList.add('has');
    p.cons.scrollTop = p.cons.scrollHeight;
  }
  window.addEventListener('message', e => {
    const d = e.data; if (!d || !d.__pg) return;
    const p = playgrounds.get(d.__pg); if (!p) return;
    addLine(p, d.k, fmtArgs(d.a));
  });
  function startPlaygrounds(slide) {
    $$('.playground', slide).forEach(pg => {
      const p = playgrounds.get(+pg.dataset.pgId);
      if (p && !p.started) {
        p.started = true;
        if (p.manual) addLine(p, 'info', 'This program asks for input() — press ▶ Run to start it.');
        else p.run();
      }
    });
  }

  /* ---------- Quiz ---------- */
  function buildQuiz(q) {
    const answer = q.dataset.answer;
    $$('button.opt, [data-opt]', q).forEach(b => {
      b.classList.add('opt'); b.type = 'button';
      b.addEventListener('click', () => {
        if (b.dataset.opt === answer) {
          b.classList.add('right'); q.classList.add('done');
          $$('button.opt', q).forEach(x => (x.disabled = true));
          confetti();
        } else {
          b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
        }
      });
    });
  }
  function confetti(n = 36) {
    const bits = ['🎉', '⚛️', '✨', '🎊', '💙', '⭐'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = bits[i % bits.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
      s.style.animationDelay = Math.random() * .4 + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 4200);
    }
  }

  /* ---------- Small widgets ---------- */
  function buildFlip(f) {
    if (!$('.flip-inner', f)) {
      const inner = document.createElement('div'); inner.className = 'flip-inner';
      while (f.firstChild) inner.appendChild(f.firstChild);
      f.appendChild(inner);
    }
    f.tabIndex = 0;
    const t = () => f.classList.toggle('flipped');
    f.addEventListener('click', t);
    f.addEventListener('keydown', e => { if (e.key === 'Enter') t(); });
  }
  function buildTabs(tabs) {
    const panes = $$(':scope > .tab', tabs);
    const bar = document.createElement('div'); bar.className = 'tabs-bar';
    panes.forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = p.dataset.label || 'Tab ' + (i + 1);
      b.onclick = () => { panes.forEach((x, k) => { x.classList.toggle('on', k === i); bar.children[k].classList.toggle('on', k === i); }); };
      bar.appendChild(b);
    });
    tabs.prepend(bar);
    bar.children[0] && bar.children[0].click();
  }
  function buildExplorer(ex) {
    const info = $('.explorer-info', ex);
    const items = $$('[data-info]', ex);
    items.forEach(it => it.addEventListener('click', e => {
      e.stopPropagation();
      items.forEach(x => x.classList.remove('on')); it.classList.add('on');
      if (info) { info.innerHTML = `<h3>${esc(it.dataset.name || it.textContent.trim())}</h3><p>${it.dataset.info}</p>`; info.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 300); }
    }));
  }
  const REACT_SVG = `<svg viewBox="-11.5 -10.23 23 20.46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle r="2.05" fill="currentColor"/><g stroke="currentColor" stroke-width="1" fill="none"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g></svg>`;

  /* ---------- Build deck ---------- */
  const body = document.body;
  const slidesEl = $('.slides');
  const slides = $$('.slide', slidesEl);
  const classNo = body.dataset.class || '';
  const duration = +(body.dataset.duration || 60);

  $$('script[type="text/x-code"]').forEach(buildCode);
  $$('.playground').forEach(buildPlayground);
  $$('.quiz').forEach(buildQuiz);
  $$('.flip').forEach(buildFlip);
  $$('.tabs').forEach(buildTabs);
  $$('.explorer').forEach(buildExplorer);
  $$('.react-logo').forEach(el => { if (!el.innerHTML.trim()) el.innerHTML = REACT_SVG; });
  $$('.spoiler').forEach(s => s.addEventListener('click', () => s.classList.add('revealed')));

  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = `
    <a class="home" href="${esc(body.dataset.home || 'index.html')}" title="Back to course plan"><span class="atom">${esc(body.dataset.icon || '⚛')}</span><span>${esc(body.dataset.course || 'React Course')}</span></a>
    <div class="crumb">${classNo ? `<span class="badge">Class ${esc(classNo)}</span>` : ''}<span class="crumb-title">${esc(body.dataset.title || document.title)}</span></div>
    <div class="tools">
      <button class="tool" data-act="timer" title="Class timer — click to start/pause (T)"><span class="timer">⏱ 00:00</span></button>
      <button class="tool" data-act="overview" title="All slides (O)">▦</button>
      <button class="tool" data-act="notes" title="Teacher notes (N)">📝</button>
      <button class="tool" data-act="theme" title="Light / dark (D)">◐</button>
      <button class="tool" data-act="full" title="Fullscreen (F)">⛶</button>
      <button class="tool" data-act="help" title="Keyboard shortcuts (?)">?</button>
    </div>`;
  body.prepend(top);

  const bottom = document.createElement('footer');
  bottom.className = 'bottombar';
  bottom.innerHTML = `<button class="navbtn prev" title="Previous (←)">← Prev</button>
    <div class="progress" title="Jump"><i></i></div>
    <span class="counter"></span>
    <button class="navbtn next" title="Next (→ / Space)">Next →</button>`;
  body.appendChild(bottom);

  const drawer = document.createElement('div');
  drawer.className = 'notes-drawer';
  drawer.innerHTML = `<div class="nd-head">📝 Teacher notes</div><div class="nd-body"></div>`;
  body.appendChild(drawer);

  const overview = document.createElement('div');
  overview.className = 'modal';
  overview.innerHTML = `<div class="modal-box"><h3>All slides <button class="btn small" data-close>Close ✕</button></h3><div class="ov-grid"></div></div>`;
  body.appendChild(overview);

  const help = document.createElement('div');
  help.className = 'modal';
  help.innerHTML = `<div class="modal-box" style="max-width:520px"><h3>Keyboard shortcuts <button class="btn small" data-close>Close ✕</button></h3>
    <div class="keys">
      <span><kbd>→</kbd> <kbd>Space</kbd></span><span>Next step / slide</span>
      <span><kbd>←</kbd></span><span>Previous step / slide</span>
      <span><kbd>Home</kbd> <kbd>End</kbd></span><span>First / last slide</span>
      <span><kbd>O</kbd></span><span>Overview of all slides</span>
      <span><kbd>N</kbd></span><span>Show / hide teacher notes</span>
      <span><kbd>T</kbd></span><span>Start / pause class timer</span>
      <span><kbd>D</kbd></span><span>Light / dark theme</span>
      <span><kbd>F</kbd></span><span>Fullscreen</span>
      <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span><span>Run code in a playground</span>
    </div></div>`;
  body.appendChild(help);
  [overview, help].forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.remove('open'); }));

  const ovGrid = $('.ov-grid', overview);
  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'ov-item';
    const h = $('h1, h2', s);
    b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${esc(s.dataset.title || (h ? h.textContent : 'Slide ' + (i + 1)))}`;
    b.onclick = () => { overview.classList.remove('open'); go(i, { revealAll: true }); };
    ovGrid.appendChild(b);
  });

  /* ---------- Navigation ---------- */
  let cur = 0;
  const stepsOf = i => $$('.step', slides[i]);
  function go(i, opts = {}) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.classList.toggle('past', k < i); });
    stepsOf(i).forEach(x => x.classList.toggle('shown', !!opts.revealAll));
    cur = i;
    slides[i].scrollTop = 0;
    $('.counter', bottom).textContent = `${i + 1} / ${slides.length}`;
    $('.progress i', bottom).style.width = ((i + 1) / slides.length * 100) + '%';
    $('.prev', bottom).disabled = i === 0;
    $('.next', bottom).disabled = i === slides.length - 1 && !stepsOf(i).some(x => !x.classList.contains('shown'));
    $$('.ov-item', ovGrid).forEach((b, k) => b.classList.toggle('cur', k === i));
    const notes = $('.notes', slides[i]);
    $('.nd-body', drawer).innerHTML = notes ? notes.innerHTML : '<span class="muted">No notes for this slide.</span>';
    try { history.replaceState(null, '', '#' + (i + 1)); } catch { /* file:// in some browsers */ }
    startPlaygrounds(slides[i]);
    slides[i].dispatchEvent(new CustomEvent('enter'));
  }
  function updateNextBtn() {
    $('.next', bottom).disabled = cur === slides.length - 1 && !stepsOf(cur).some(x => !x.classList.contains('shown'));
  }
  function next() {
    const hidden = stepsOf(cur).find(x => !x.classList.contains('shown'));
    if (hidden) { hidden.classList.add('shown'); updateNextBtn(); return; }
    if (cur < slides.length - 1) go(cur + 1);
  }
  function prev() {
    const shown = stepsOf(cur).filter(x => x.classList.contains('shown'));
    if (shown.length) { shown[shown.length - 1].classList.remove('shown'); updateNextBtn(); return; }
    if (cur > 0) go(cur - 1, { revealAll: true });
  }
  $('.next', bottom).onclick = next;
  $('.prev', bottom).onclick = prev;
  $('.progress', bottom).onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    go(Math.floor((e.clientX - r.left) / r.width * slides.length), { revealAll: true });
  };

  /* ---------- Timer ---------- */
  let tStart = null, tAcc = 0, tInt = null;
  const timerBtn = $('[data-act="timer"]', top), timerEl = $('.timer', top);
  function renderTimer() {
    const ms = tAcc + (tStart ? Date.now() - tStart : 0);
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
    timerEl.textContent = `${tStart ? '⏱' : '⏸'} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    timerBtn.classList.toggle('warn', m >= duration - 5 && m < duration);
    timerBtn.classList.toggle('over', m >= duration);
  }
  function toggleTimer() {
    if (tStart) { tAcc += Date.now() - tStart; tStart = null; clearInterval(tInt); }
    else { tStart = Date.now(); tInt = setInterval(renderTimer, 500); }
    renderTimer();
  }
  timerBtn.addEventListener('dblclick', () => { tAcc = 0; if (tStart) tStart = Date.now(); renderTimer(); });
  timerBtn.title += ' · double-click to reset';

  /* ---------- Tools ---------- */
  function toggleNotes() { drawer.classList.toggle('open'); $('[data-act="notes"]', top).classList.toggle('on', drawer.classList.contains('open')); }
  function toggleFull() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  const actions = {
    timer: toggleTimer, overview: () => overview.classList.add('open'), notes: toggleNotes,
    theme: toggleTheme, full: toggleFull, help: () => help.classList.add('open')
  };
  $$('.tool', top).forEach(b => b.addEventListener('click', () => actions[b.dataset.act]()));

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'select' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') { overview.classList.remove('open'); help.classList.remove('open'); return; }
    if (['ArrowRight', 'PageDown', ' '].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1, { revealAll: true });
    else if (k === 'o' || k === 'O') overview.classList.toggle('open');
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 't' || k === 'T') toggleTimer();
    else if (k === 'd' || k === 'D') toggleTheme();
    else if (k === 'f' || k === 'F') toggleFull();
    else if (k === '?') help.classList.toggle('open');
  });

  // Swipe on touch screens
  let sx = null;
  slidesEl.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  slidesEl.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 70) (dx < 0 ? next : prev)();
  });

  window.Deck = { go, next, prev, confetti };
  const start = parseInt(location.hash.slice(1), 10);
  go(Number.isFinite(start) ? start - 1 : 0, { revealAll: Number.isFinite(start) && start > 1 });
  renderTimer();
})();
