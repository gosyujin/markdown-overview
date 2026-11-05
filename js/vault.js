/*
 * vault.js — マスク定義をパスフレーズで暗号化／復号する（Web Crypto API のみ使用）
 *
 * AES-256-GCM + PBKDF2(SHA-256, 600,000 回)。鍵・平文はこのページのメモリ上にしか存在せず、
 * 暗号化結果はユーザーがダウンロードするファイルとしてのみ出力される。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MDO = root.MDO || {}).Vault = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ITER = 600000;
  var MAGIC = 'markdown-overview-rules';

  function subtle() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('この環境では Web Crypto が使えません（https または localhost で開いてください）');
    return c;
  }

  function b64(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function unb64(str) {
    var s = atob(str);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  async function deriveKey(pass, salt, iter) {
    var c = subtle();
    var base = await c.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** @returns {Promise<string>} JSON 文字列 */
  async function encrypt(plaintext, pass) {
    var c = subtle();
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(pass, salt, ITER);
    var ct = await c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plaintext));
    return JSON.stringify({
      magic: MAGIC, v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, cipher: 'AES-256-GCM',
      salt: b64(salt), iv: b64(iv), ct: b64(ct)
    });
  }

  function isEncrypted(text) {
    try {
      var o = JSON.parse(text);
      return !!o && o.magic === MAGIC;
    } catch (e) {
      return false;
    }
  }

  /** @returns {Promise<string>} 平文。パスフレーズ違い・改ざんは例外 */
  async function decrypt(text, pass) {
    var o = JSON.parse(text);
    if (!o || o.magic !== MAGIC || o.v !== 1) throw new Error('対応していない形式です');
    var iter = Number(o.iter);
    if (!(iter >= 100000 && iter <= 5000000)) throw new Error('不正なファイルです');
    var key = await deriveKey(pass, unb64(o.salt), iter);
    try {
      var pt = await subtle().subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct));
      return new TextDecoder().decode(pt);
    } catch (e) {
      throw new Error('パスフレーズが違うか、ファイルが壊れています');
    }
  }

  return { encrypt: encrypt, decrypt: decrypt, isEncrypted: isEncrypted };
});
