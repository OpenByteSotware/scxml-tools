import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Initial pseudostate visualization', () => {
  test('renders root and compound initial tags as solid circles with arrows', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /initialPseudoStates/);
    assert.match(source, /State machine initial state/);
    assert.match(source, /Initial substate/);
    assert.match(source, /id=\"initial-arrow\"/);
    assert.match(source, /initial-pseudostate circle\{fill:#3fb950/);
  });
});
