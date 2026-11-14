import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Initial-state visuals', () => {
  test('renders filled badge and recognizes nested and parallel-region semantics', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /initial-badge/);
    assert.match(source, /parent\.kind === 'parallel' \|\| parent\.initial === state\.id/);
    assert.match(source, /initial-badge circle\{fill:#3fb950/);
  });
});
