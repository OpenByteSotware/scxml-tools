import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Nested state drag/drop webview source', () => {
  test('stops nested pointer event propagation and posts reparent command', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /pointerdown'.*event\.stopPropagation\(\)/s);
    assert.match(source, /command:'reparentState'/);
    assert.match(source, /data-depth=/);
  });
});
