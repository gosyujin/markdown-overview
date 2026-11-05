/*
 * app.js — Markdown Overview 本体
 *
 * 方針:
 *  - 入力・マスク定義は DOM 上（メモリ）にしか置かない。localStorage / Cookie / IndexedDB / 通信は使わない。
 *  - マスクは「Markdown ソース」に対して置換してからレンダリングする。
 *    こうすると見出し・コード・表・リンク等どこに現れた語句も一貫して置換され、コピーされる内容も表示と一致する。
 *  - 出力は DOMPurify でサニタイズ（貼り付けテキストに含まれる HTML / script は無効化）。
 */
(function () {
  'use strict';

  var Mask = window.MDO.Mask;
  var Vault = window.MDO.Vault;
  var TableText = window.MDO.TableText;

  function $(sel) { return document.querySelector(sel); }

  var els = {
    src: $('#src'), preview: $('#preview'), status: $('#status'),
    modeRaw: $('#mode-raw'), modeMask: $('#mode-mask'),
    btnRules: $('#btn-rules'), rulesCount: $('#rules-count'),
    inputPane: $('#input-pane'), btnPaste: $('#btn-paste'), btnToggleSrc: $('#btn-toggle-src'), btnClear: $('#btn-clear'), btnTheme: $('#btn-theme'),
    file: $('#file'),
    dialog: $('#rules-dialog'), rulesSrc: $('#rules-src'), rulesInfo: $('#rules-info'),
    pass: $('#pass'), rulesFile: $('#rules-file'),
    saveEnc: $('#rules-save-enc'), savePlain: $('#rules-save-plain'), rulesClear: $('#rules-clear')
  };

  var state = { mode: 'raw', rules: [], ruleErrors: [], theme: 'auto' };

  /* ======================= サニタイズ設定 ======================= */

  var SAFE_HREF = /^(https?:|mailto:)/i;

  var purifyConfig = {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style']
  };

  /* ======================= レンダリング ======================= */

  var renderTimer = 0;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  }

  function render() {
    clearTimeout(renderTimer);
    var raw = els.src.value;
    var maskedCount = 0;

    if (!raw.trim()) {
      showEmpty();
      updateStatus(0);
      return;
    }

    var text = raw;
    if (state.mode === 'mask') {
      var r = Mask.apply(raw, state.rules);
      text = r.text;
      maskedCount = r.count;
    }

    var html = window.marked.parse(text, { gfm: true, breaks: false, async: false });
    var frag = window.DOMPurify.sanitize(html, purifyConfig);
    enhance(frag);
    var body = document.createElement('div');
    body.className = 'md-body';
    body.appendChild(frag);
    els.preview.replaceChildren(body);
    updateStatus(maskedCount);
  }

  // 初期 HTML に書かれた空表示を退避しておき、入力が空になったら戻す
  var emptyTemplate = els.preview.firstElementChild.cloneNode(true);
  function showEmpty() { els.preview.replaceChildren(emptyTemplate.cloneNode(true)); }

  function updateStatus(maskedCount) {
    if (state.mode !== 'mask') { els.status.textContent = ''; return; }
    if (!state.rules.length) { els.status.textContent = 'Mask: ルール未設定'; return; }
    els.status.textContent = 'Mask: ' + maskedCount + ' 箇所を置換（ルール ' + state.rules.length + ' 件）';
  }

  /* ----------- DOM の後処理 ----------- */

  function enhance(root) {
    // リンク: http(s)/mailto のみ有効。外部で開くときは referrer を送らない
    root.querySelectorAll('a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (SAFE_HREF.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        a.removeAttribute('href');
        a.removeAttribute('target');
      }
    });

    // 画像: data: のみ許可。外部画像は取得せずプレースホルダに（閲覧しただけで外部へ送信されるのを防ぐ）
    root.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (!/^data:image\//i.test(src)) {
        var ph = document.createElement('span');
        ph.className = 'img-blocked';
        ph.textContent = '[画像を表示しません: ' + (img.getAttribute('alt') || src.slice(0, 60)) + ']';
        img.replaceWith(ph);
      }
    });

    // チェックボックス以外の input は除去、タスクリストにクラス付与
    root.querySelectorAll('input').forEach(function (inp) {
      if (inp.type !== 'checkbox') { inp.remove(); return; }
      inp.disabled = true;
      var li = inp.closest('li');
      if (li) {
        li.classList.add('task-item');
        if (li.parentElement) li.parentElement.classList.add('contains-task-list');
      }
    });

    root.querySelectorAll('pre').forEach(wrapCode);
    root.querySelectorAll('table').forEach(wrapTable);
  }

  var LANG_ALIAS = {
    jsonc: 'json', json5: 'json', tsx: 'typescript', jsx: 'javascript', toml: 'ini', vue: 'xml',
    docker: 'dockerfile', tf: 'plaintext', hcl: 'plaintext', text: '', txt: '', plain: '', output: ''
  };

  function button(label, kind, aria) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy';
    b.dataset.copy = kind;
    b.textContent = label;
    b.dataset.label = label;
    if (aria) b.setAttribute('aria-label', aria);
    return b;
  }

  function makeHead(labelText, buttons) {
    var head = document.createElement('div');
    head.className = 'block-head';
    var l = document.createElement('span');
    l.className = 'lang';
    l.textContent = labelText;
    var actions = document.createElement('span');
    actions.className = 'actions';
    buttons.forEach(function (b) { actions.appendChild(b); });
    head.appendChild(l);
    head.appendChild(actions);
    return head;
  }

  function wrapCode(pre) {
    var code = pre.querySelector('code');
    if (!code) return;
    var m = /(?:^|\s)language-([^\s]+)/.exec(code.className || '');
    var lang = m ? m[1].toLowerCase() : '';
    var hl = Object.prototype.hasOwnProperty.call(LANG_ALIAS, lang) ? LANG_ALIAS[lang] : lang;
    var hljs = window.hljs;
    if (hl && hljs && hljs.getLanguage(hl)) {
      try {
        code.innerHTML = hljs.highlight(code.textContent, { language: hl, ignoreIllegals: true }).value;
        code.classList.add('hljs');
      } catch (e) { /* ハイライト失敗時は素のまま */ }
    }
    pre.tabIndex = 0; // キーボードでフォーカスでき、フォーカス時にコピーボタンも出る
    var wrap = document.createElement('div');
    wrap.className = 'block code-block';
    wrap.appendChild(makeHead(lang || 'code', [button('コピー', 'code', 'コードをコピー')]));
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
  }

  function wrapTable(table) {
    var wrap = document.createElement('div');
    wrap.className = 'block table-block';
    wrap.appendChild(makeHead('table', [
      button('コピー', 'tsv', '表をタブ区切りでコピー（Excel / スプレッドシート向け）'),
      button('Markdown', 'md', '表をMarkdownでコピー'),
      button('テキスト', 'text', '表を罫線テキストでコピー（テキストメール向け）')
    ]));
    var scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.tabIndex = 0;
    table.replaceWith(wrap);
    wrap.appendChild(scroll);
    scroll.appendChild(table);
  }

  /* ======================= コピー ======================= */

  function cellText(c) { return c.textContent.replace(/[\t\r\n]+/g, ' ').trim(); }

  function tableToTsv(table) {
    return Array.prototype.map.call(table.rows, function (tr) {
      return Array.prototype.map.call(tr.cells, cellText).join('\t');
    }).join('\n');
  }

  function tableToRuledText(table) {
    return TableText.render(Array.prototype.map.call(table.rows, function (tr) {
      return Array.prototype.map.call(tr.cells, function (c) { return c.textContent; });
    }));
  }

  function inlineToMd(node) {
    var out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      var inner = inlineToMd(n);
      switch (n.tagName) {
        case 'CODE': out += '`' + n.textContent + '`'; break;
        case 'STRONG': case 'B': out += '**' + inner + '**'; break;
        case 'EM': case 'I': out += '*' + inner + '*'; break;
        case 'DEL': out += '~~' + inner + '~~'; break;
        case 'BR': out += '<br>'; break;
        case 'A': out += n.getAttribute('href') ? '[' + inner + '](' + n.getAttribute('href') + ')' : inner; break;
        default: out += inner;
      }
    });
    return out;
  }

  function tableToMarkdown(table) {
    var rows = Array.prototype.map.call(table.rows, function (tr) {
      return Array.prototype.map.call(tr.cells, function (c) {
        return inlineToMd(c).replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, '<br>').trim();
      });
    });
    if (!rows.length) return '';
    var aligns = Array.prototype.map.call(table.rows[0].cells, function (c) {
      var a = c.getAttribute('align');
      return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---';
    });
    var line = function (cells) { return '| ' + cells.join(' | ') + ' |'; };
    var out = [line(rows[0]), line(aligns)];
    rows.slice(1).forEach(function (r) { out.push(line(r)); });
    return out.join('\n');
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.className = 'sr-copy';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* noop */ }
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  // Clipboard API が使えない／許可されない環境（埋め込みビューなど）では execCommand にフォールバックする
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  els.preview.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('button[data-copy]');
    if (!btn) return;
    var block = btn.closest('.block');
    var text = '';
    if (btn.dataset.copy === 'code') {
      text = block.querySelector('pre').textContent.replace(/\n$/, '');
    } else {
      var table = block.querySelector('table');
      text = btn.dataset.copy === 'md' ? tableToMarkdown(table)
        : btn.dataset.copy === 'text' ? tableToRuledText(table)
        : tableToTsv(table);
    }
    copyText(text).then(function () { flash(btn, 'コピーしました', 'done'); },
                        function () { flash(btn, '失敗しました', 'fail'); });
  });

  function flash(btn, msg, cls) {
    clearTimeout(btn._t);
    btn.textContent = msg;
    btn.classList.add(cls);
    btn._t = setTimeout(function () {
      btn.textContent = btn.dataset.label;
      btn.classList.remove('done', 'fail');
    }, 1500);
  }

  /* ======================= 入力 ======================= */

  els.src.addEventListener('input', scheduleRender);

  var MAX_BYTES = 5 * 1024 * 1024;

  function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) { els.status.textContent = 'ファイルが大きすぎます（5MBまで）'; return; }
    file.text().then(setText);
  }

  els.file.addEventListener('change', function () {
    loadFile(els.file.files[0]);
    els.file.value = ''; // 選択履歴を残さない
  });

  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) {
      dragDepth++; document.body.classList.add('is-dragging');
    }
  });
  window.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('is-dragging');
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('is-dragging');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  els.btnClear.addEventListener('click', function () {
    setText('');
  });

  function setSrcOpen(open) {
    els.src.hidden = !open;
    els.inputPane.classList.toggle('open', open);
    els.btnToggleSrc.setAttribute('aria-expanded', String(open));
    els.btnToggleSrc.textContent = open ? '▲ 貼り付け欄を閉じる' : '▼ 貼り付け欄を開く';
    if (open) els.src.focus();
  }
  els.btnToggleSrc.addEventListener('click', function () { setSrcOpen(els.src.hidden); });

  function setText(text) {
    els.src.value = text;
    render();
  }

  // 「クリップボードから貼り付け」: 読み取り許可が得られない環境では、貼り付け欄を開いて手動貼り付けに誘導する
  els.btnPaste.addEventListener('click', function () {
    var p = navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject();
    p.then(function (t) {
      if (!t) { els.status.textContent = 'クリップボードが空です'; return; }
      setText(t);
    }, function () {
      setSrcOpen(true);
      els.status.textContent = '自動で読み取れませんでした。貼り付け欄に ⌘V / Ctrl+V で貼り付けてください';
    });
  });

  // 入力欄以外にフォーカスがある状態での貼り付け（⌘V / Ctrl+V）をそのまま取り込む
  document.addEventListener('paste', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
    var text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); setText(text); }
  });

  /* ======================= モード / テーマ ======================= */

  function setMode(mode) {
    state.mode = mode;
    document.body.dataset.mode = mode;
    els.modeRaw.setAttribute('aria-pressed', String(mode === 'raw'));
    els.modeMask.setAttribute('aria-pressed', String(mode === 'mask'));
    render();
  }
  els.modeRaw.addEventListener('click', function () { setMode('raw'); });
  els.modeMask.addEventListener('click', function () { setMode('mask'); });

  var THEMES = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: '自動', light: 'ライト', dark: 'ダーク' };
  els.btnTheme.addEventListener('click', function () {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.theme);
    els.btnTheme.textContent = THEME_LABEL[state.theme];
  });

  /* ======================= マスク設定 ======================= */

  function info(msg, kind) {
    els.rulesInfo.textContent = msg;
    els.rulesInfo.className = 'dlg-info' + (kind ? ' ' + kind : '');
  }

  function reparseRules() {
    var p = Mask.parseRules(els.rulesSrc.value);
    state.rules = p.rules;
    state.ruleErrors = p.errors;
    els.rulesCount.textContent = String(p.rules.length);
    if (p.errors.length) {
      info('有効 ' + p.rules.length + ' 件 / 解釈できない行: ' + p.errors.map(function (e) { return e.line; }).join(', ') + ' 行目', 'err');
    } else {
      info('有効 ' + p.rules.length + ' 件');
    }
    if (state.mode === 'mask') scheduleRender();
  }

  els.rulesSrc.addEventListener('input', reparseRules);
  els.btnRules.addEventListener('click', function () {
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
    els.rulesSrc.focus();
  });
  els.dialog.addEventListener('close', function () { els.pass.value = ''; });

  els.rulesClear.addEventListener('click', function () {
    els.rulesSrc.value = '';
    reparseRules();
  });

  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  els.saveEnc.addEventListener('click', function () {
    var pass = els.pass.value;
    if (!els.rulesSrc.value.trim()) { info('保存する定義がありません', 'err'); return; }
    if (pass.length < 8) { info('パスフレーズは8文字以上にしてください', 'err'); return; }
    Vault.encrypt(els.rulesSrc.value, pass).then(function (json) {
      download('markdown-overview-rules.enc.json', json, 'application/json');
      info('暗号化して保存しました（パスフレーズは忘れると復元できません）', 'ok');
    }, function (e) { info(e.message, 'err'); });
  });

  els.savePlain.addEventListener('click', function () {
    if (!els.rulesSrc.value.trim()) { info('保存する定義がありません', 'err'); return; }
    download('markdown-overview-rules.txt', els.rulesSrc.value, 'text/plain');
    info('平文で保存しました。取り扱いにご注意ください', 'ok');
  });

  els.rulesFile.addEventListener('change', function () {
    var f = els.rulesFile.files[0];
    els.rulesFile.value = '';
    if (!f) return;
    if (f.size > 1024 * 1024) { info('ファイルが大きすぎます', 'err'); return; }
    f.text().then(function (text) {
      if (Vault.isEncrypted(text)) {
        if (!els.pass.value) { info('暗号化ファイルです。パスフレーズを入力してから、もう一度選択してください', 'err'); return; }
        return Vault.decrypt(text, els.pass.value).then(function (plain) {
          els.rulesSrc.value = plain;
          reparseRules();
          info('復号して読み込みました（有効 ' + state.rules.length + ' 件）', 'ok');
        });
      }
      els.rulesSrc.value = text;
      reparseRules();
    }).catch(function (e) { info(e.message || '読み込みに失敗しました', 'err'); });
  });

  /* ======================= 初期化 ======================= */

  // ブラウザのフォーム復元で入力が残ることがあるため、起動時に必ず空にする
  els.src.value = '';
  els.rulesSrc.value = '';
  reparseRules();
  document.body.dataset.mode = 'raw';
})();
