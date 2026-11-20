import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 8 initial and history actions UI', () => {
  test('wires root, compound-state, and history transition action editors', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /root-initial-actions/);
    assert.match(source, /state-initial-actions/);
    assert.match(source, /history-transition-actions/);
    assert.match(source, /updateInitialTransitionActions/);
    assert.match(source, /save-history-actions/);
  });
});
