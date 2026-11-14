import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Independent editor scrolling', () => {
  test('gives the chart and properties their own vertical scroll containers', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /html,body\{height:100%;overflow:hidden\}/);
    assert.match(source, /\.workspace\{[^}]*min-height:0;overflow:hidden/);
    assert.match(source, /\.workspace>main[^}]*overflow:hidden/);
    assert.match(source, /\.canvas\{[^}]*overflow:auto[^}]*height:100%/);
    assert.match(source, /\.properties\{[^}]*overflow-y:auto/);
  });
});
