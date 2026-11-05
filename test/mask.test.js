'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mask = require('../js/mask.js');
const Vault = require('../js/vault.js');

test('parseRules: 各種区切り文字', () => {
  const { rules, errors } = Mask.parseRules(
    ['丸丸システム, システムA', 'foo => bar', 'a -> b', 'x → y', 'p\tq', '# comment', '', 'broken'].join('\n')
  );
  assert.deepEqual(rules, [
    { from: '丸丸システム', to: 'システムA' },
    { from: 'foo', to: 'bar' },
    { from: 'a', to: 'b' },
    { from: 'x', to: 'y' },
    { from: 'p', to: 'q' },
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 8);
});

test('parseRules: 置換先が空の行はエラー、重複は先勝ち', () => {
  const { rules, errors } = Mask.parseRules('a =>\na => 1\na => 2');
  assert.deepEqual(rules, [{ from: 'a', to: '1' }]);
  assert.equal(errors.length, 1);
});

test('apply: 基本置換とカウント', () => {
  const { rules } = Mask.parseRules('丸丸システム, システムA');
  const r = Mask.apply('丸丸システムの障害。丸丸システムは…', rules);
  assert.equal(r.text, 'システムAの障害。システムAは…');
  assert.equal(r.count, 2);
});

test('apply: 長い語を優先する', () => {
  const { rules } = Mask.parseRules('丸丸, X\n丸丸システム, システムA');
  assert.equal(Mask.apply('丸丸システムと丸丸', rules).text, 'システムAとX');
});

test('apply: 連鎖しない（A→B, B→C）', () => {
  const { rules } = Mask.parseRules('A => B\nB => C');
  assert.equal(Mask.apply('A B', rules).text, 'B C');
});

test('apply: 正規表現の特殊文字はリテラル扱い', () => {
  const { rules } = Mask.parseRules('a.b(c) => Z\n$1 => Y');
  assert.equal(Mask.apply('a.b(c) axb(c) $1', rules).text, 'Z axb(c) Y');
});

test('apply: 置換先の $& などはそのまま出力される', () => {
  const { rules } = Mask.parseRules('a => $&$1');
  assert.equal(Mask.apply('a', rules).text, '$&$1');
});

test('apply: ルールなしなら無加工', () => {
  assert.deepEqual(Mask.apply('abc', []), { text: 'abc', count: 0 });
});

test('Vault: 暗号化→復号のラウンドトリップ', async () => {
  const enc = await Vault.encrypt('丸丸システム => システムA', 'pass-123');
  assert.ok(Vault.isEncrypted(enc));
  assert.ok(!enc.includes('丸丸'));
  assert.equal(await Vault.decrypt(enc, 'pass-123'), '丸丸システム => システムA');
});

test('Vault: パスフレーズ違いは失敗', async () => {
  const enc = await Vault.encrypt('secret', 'right');
  await assert.rejects(() => Vault.decrypt(enc, 'wrong'));
});

test('Vault: 平文JSON以外はisEncryptedがfalse', () => {
  assert.equal(Vault.isEncrypted('a => b'), false);
  assert.equal(Vault.isEncrypted('{"x":1}'), false);
});
