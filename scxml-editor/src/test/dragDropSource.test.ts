import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('State drag webview source', () => {
  test('captures on the source state and tracks at window level', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /node\.setPointerCapture/);
    assert.doesNotMatch(source, /svg\.setPointerCapture/);
    assert.match(source, /window\.addEventListener\('pointermove',handleStatePointerMove,true\)/);
    assert.match(source, /window\.addEventListener\('pointerup',finishStateDrag,true\)/);
    assert.match(source, /command:'reparentState'/);
  });
});
