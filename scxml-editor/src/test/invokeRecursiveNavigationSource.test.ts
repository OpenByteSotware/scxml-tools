import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Recursive invoke navigation', () => {
  test('opens invoke cards on double-click and provides a parent button', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /private readonly invokeParents/);
    assert.match(source, /addEventListener\('dblclick'/);
    assert.match(source, /Back to Parent State/);
    assert.match(source, /command:'backToParent'/);
    assert.match(source, /message\.command === 'backToParent'/);
    assert.match(source, /invokeParents\.set\(targetUri\.toString\(\), document\.uri\)/);
  });
});
