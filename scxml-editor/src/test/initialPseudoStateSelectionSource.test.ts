import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Initial pseudostate selection', () => {
  test('clicks root and nested initial markers to edit their owning transition settings', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /message\.command === 'selectInitial'/);
    assert.match(source, /message\.scopeId === 'scxml' \? '__root__' : message\.scopeId/);
    assert.match(source, /querySelectorAll\('\.initial-pseudostate'\)/);
    assert.match(source, /command:'selectInitial'/);
    assert.match(source, /Edit initial transition/);
    assert.match(source, /initial-pseudostate\{pointer-events:all;cursor:pointer\}/);
    assert.match(source, /initial-pseudostate\.selected circle/);
  });
});
