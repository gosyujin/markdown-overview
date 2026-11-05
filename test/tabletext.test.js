'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TableText = require('../js/tabletext.js');

test('displayWidth: 全角=2, 半角=1', () => {
  assert.equal(TableText.displayWidth('abc'), 3);
  assert.equal(TableText.displayWidth('あい'), 4);
  assert.equal(TableText.displayWidth('A　B'), 4);
});

test('基本の整形: 全角スペース＋必要なら半角スペースで埋める', () => {
  const out = TableText.render([['A', 'あい'], ['xyz', 'b']]);
  assert.equal(out, 'A\u3000 │あい\n──┼──\nxyz │b');
});

test('日本語を含む表で、先頭列の表示幅が全行で揃う（罫線は全角幅として計算）', () => {
  const out = TableText.render([
    ['元の値', 'inventory_mask.xlsx'],
    ['sample_database_dev', '開発環境'],
    ['C:\\DATA\\sample_database_iji_log.ldf', 'C:\\DATA\\維持管理環境_log.ldf'],
    ['sample_database_devsample_database', '開発環境本番環境'],
  ]);
  const lines = out.split('\n');
  const firstColWidth = (l) => {
    const i = l.search(/[│┼]/);
    return [...l.slice(0, i)].reduce((s, ch) => s + (ch === '─' ? 2 : TableText.displayWidth(ch)), 0);
  };
  assert.equal(new Set(lines.map(firstColWidth)).size, 1);
  assert.equal(lines[1].split('┼').map((s) => s.length).join(','), '18,14');
  assert.ok(lines[0].startsWith('元の値'));
  assert.ok(!lines.some((l) => /[ \u3000]$/.test(l)), '行末に余白を残さない');
});

test('1列の表', () => {
  assert.equal(TableText.render([['a'], ['bb']]), 'a\n─\nbb');
});

test('不揃いな行は空セルで補う', () => {
  assert.equal(TableText.render([['a', 'b'], ['c']]), 'a │b\n─┼─\nc │');
});

test('セル内の改行は空白にする', () => {
  assert.equal(TableText.render([['a\nb', 'x']]).split('\n')[0], 'a b │x');
});
