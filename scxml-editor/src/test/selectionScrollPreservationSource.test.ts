import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Selection scroll preservation', () => {
  test('retains the chart viewport while refreshing properties', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /priorWebviewState=vscode\.getState\(\)\|\|\{\}/);
    assert.match(source, /chartScroller\.scrollLeft=Number\(priorWebviewState\.chartScrollLeft\|\|0\)/);
    assert.match(source, /chartScroller\.scrollTop=Number\(priorWebviewState\.chartScrollTop\|\|0\)/);
    assert.match(source, /const rememberChartScroll=/);
    assert.match(source, /rememberChartScroll\(\);vscode\.postMessage\(\{command:'selectState'/);
  });
});
