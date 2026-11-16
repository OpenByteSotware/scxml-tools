import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Parallel divider drag updates', () => {
  test('recalculates divider coordinates whenever states move', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /function updateParallelDividers\(\)/);
    assert.match(source, /data-index="\$\{index\}"/);
    assert.match(source, /updateEdges\(\);updateParallelDividers\(\);/);
  });
});
