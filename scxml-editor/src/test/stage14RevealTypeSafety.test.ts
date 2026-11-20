import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 14 reveal request type safety', () => {
  test('constructs reveal requests from narrowed local values', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /const stateId = String\(message\.stateId \|\| ''\);/);
    assert.match(source, /const transitionIndex = Number\(message\.index\);/);
    assert.match(source, /revealRequest = \{ stateId, transitionIndex \};/);
    assert.doesNotMatch(source, /revealRequest = \{ stateId: selectedId, transitionIndex: selectedTransition \};/);
  });
});
