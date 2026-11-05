/*
 * mask.js — 置換ルールのパースと適用（純粋関数のみ。DOM・ネットワーク・ストレージには触れない）
 *
 * ルール書式（1行1ルール）:
 *   丸丸システム, システムA
 *   丸丸システム => システムA
 *   丸丸システム -> システムA
 *   丸丸システム → システムA
 *   丸丸システム<TAB>システムA
 * 空行と「#」始まりの行は無視する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MDO = root.MDO || {}).Mask = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 優先順に探す。矢印 > タブ > カンマ。
  var SEPARATORS = ['=>', '->', '→', '\t', ',', '，', '、'];

  function splitLine(line) {
    for (var i = 0; i < SEPARATORS.length; i++) {
      var idx = line.indexOf(SEPARATORS[i]);
      if (idx > 0) {
        return [line.slice(0, idx), line.slice(idx + SEPARATORS[i].length)];
      }
    }
    return null;
  }

  /** @returns {{rules: {from:string,to:string}[], errors: {line:number,text:string}[]}} */
  function parseRules(source) {
    var rules = [];
    var errors = [];
    var seen = Object.create(null);
    String(source || '').split(/\r\n|\r|\n/).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = splitLine(line);
      var from = parts && parts[0].trim();
      var to = parts && parts[1].trim();
      if (!from || !to) {
        errors.push({ line: i + 1, text: raw });
        return;
      }
      if (seen[from]) return; // 先勝ち
      seen[from] = true;
      rules.push({ from: from, to: to });
    });
    return { rules: rules, errors: errors };
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  }

  /**
   * ルールを一括置換する。
   * - 長い語を優先（「丸丸システム」が「丸丸」より先に当たる）
   * - 1パスで置換するので、A→B と B→C があっても連鎖しない
   * @returns {{text:string, count:number}}
   */
  function apply(text, rules) {
    text = String(text == null ? '' : text);
    if (!rules || !rules.length) return { text: text, count: 0 };
    var map = Object.create(null);
    var terms = [];
    rules.forEach(function (r) {
      if (!(r.from in map)) {
        map[r.from] = r.to;
        terms.push(r.from);
      }
    });
    terms.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp(terms.map(escapeRegExp).join('|'), 'g');
    var count = 0;
    var out = text.replace(re, function (m) {
      count++;
      return map[m];
    });
    return { text: out, count: count };
  }

  return { parseRules: parseRules, apply: apply };
});
