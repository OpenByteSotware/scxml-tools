import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('State drag webview source', () => {
  test('uses mouse drag tracking independent of SVG pointer capture', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /node\.addEventListener\('mousedown'/);
    assert.match(source, /window\.addEventListener\('mousemove',handleStateMouseMove,true\)/);
    assert.match(source, /window\.addEventListener\('mouseup',finishStateMouseDrag,true\)/);
    assert.doesNotMatch(source, /node\.setPointerCapture/);
    assert.match(source, /command:'reparentState'/);
  });
});
