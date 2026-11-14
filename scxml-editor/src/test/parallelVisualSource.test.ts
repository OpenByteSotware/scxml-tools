import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Parallel state visual source', () => {
  test('renders checkbox, badge, and region separators', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /id=\"state-parallel\"/);
    assert.match(source, /parallel-badge/);
    assert.match(source, /parallel-region-divider/);
    assert.match(source, /state\.children\.slice\(0, -1\)/);
  });
});
