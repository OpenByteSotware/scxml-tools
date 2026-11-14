import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Click selection', () => {
  test('left-clicks states and broad transition areas to show properties', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /svg\.addEventListener\('click'/);
    assert.match(source, /command:'selectState'/);
    assert.match(source, /command:'selectTransition'/);
    assert.match(source, /class="edge-hit"/);
    assert.match(source, /class="transition-label-hit"/);
  });
});
