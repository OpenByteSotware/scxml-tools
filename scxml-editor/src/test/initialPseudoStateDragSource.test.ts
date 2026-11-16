import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Initial pseudostate drag updates', () => {
  test('recalculates initial circle and arrow coordinates during state movement', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /function updateInitialPseudoStates\(\)/);
    assert.match(source, /marker\.dataset\.target/);
    assert.match(source, /circle\.setAttribute\('cx'/);
    assert.match(source, /path\.setAttribute\('d'/);
    assert.match(source, /updateParallelDividers\(\);updateInitialPseudoStates\(\);/);
  });
});
