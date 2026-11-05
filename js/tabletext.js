/*
 * tabletext.js — 表を「テキストメールなどで人が読みやすい罫線テキスト」に整形する（純粋関数）
 *
 *   元の値　　　　　　│値
 *   ─────────┼─────
 *   abc　　　　　　　 │あいう
 *
 * - 外枠なし。列の区切りは「│」、見出し行の下は「─」と「┼」
 * - 列は表示幅（全角=2, 半角=1）で揃える。余りは全角スペース＋必要なら半角スペース1つで埋める
 * - 日本語環境の等幅フォントで「─ │ ┼」が全角幅で表示される前提で、列幅を偶数にそろえて罫線の長さを合わせる
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MDO = root.MDO || {}).TableText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WIDE = [
    [0x1100, 0x115F], [0x2E80, 0x303E], [0x3041, 0x33FF], [0x3400, 0x4DBF], [0x4E00, 0x9FFF],
    [0xA000, 0xA4CF], [0xAC00, 0xD7A3], [0xF900, 0xFAFF], [0xFE30, 0xFE6F], [0xFF00, 0xFF60],
    [0xFFE0, 0xFFE6], [0x1F300, 0x1F64F], [0x1F900, 0x1F9FF], [0x20000, 0x3FFFD]
  ];

  function charWidth(cp) {
    for (var i = 0; i < WIDE.length; i++) {
      if (cp >= WIDE[i][0] && cp <= WIDE[i][1]) return 2;
    }
    return 1;
  }

  function displayWidth(str) {
    var w = 0;
    for (var ch of String(str)) w += charWidth(ch.codePointAt(0));
    return w;
  }

  function pad(str, width) {
    var d = width - displayWidth(str);
    if (d <= 0) return str;
    return str + '　'.repeat(Math.floor(d / 2)) + (d % 2 ? ' ' : '');
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  }

  /**
   * @param {string[][]} rows  rows[0] が見出し行
   * @returns {string}
   */
  function render(rows) {
    rows = rows.map(function (r) { return r.map(clean); });
    if (!rows.length) return '';
    var cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    rows = rows.map(function (r) {
      var out = r.slice();
      while (out.length < cols) out.push('');
      return out;
    });

    var widths = [];
    for (var c = 0; c < cols; c++) {
      var w = 0;
      rows.forEach(function (r) { w = Math.max(w, displayWidth(r[c])); });
      widths.push(w + (w % 2)); // 偶数にそろえる（罫線 1 文字 = 半角 2 つ分）
    }

    function line(r) {
      return r.map(function (cell, i) {
        return i === cols - 1 ? cell : pad(cell, widths[i]);
      }).join('│');
    }

    var out = [line(rows[0])];
    out.push(widths.map(function (w) { return '─'.repeat(Math.max(1, w / 2)); }).join('┼'));
    rows.slice(1).forEach(function (r) { out.push(line(r)); });
    return out.join('\n');
  }

  return { render: render, displayWidth: displayWidth };
});
