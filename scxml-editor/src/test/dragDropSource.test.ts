import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('State drag webview source', () => {
  test('uses an explicit SVG header drag surface', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /class=\"drag-surface\"/);
    assert.match(source, /svg\.addEventListener\('mousedown'/);
    assert.match(source, /event\.target\.closest\?\.\('\.drag-surface'\)/);
    assert.match(source, /window\.addEventListener\('mousemove',handleStateMouseMove,true\)/);
    assert.match(source, /window\.addEventListener\('mouseup',finishStateMouseDrag,true\)/);
  });
});
