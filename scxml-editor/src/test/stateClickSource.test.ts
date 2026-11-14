import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('State left-click selection', () => {
  test('does not suppress a click until the state actually moves', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.doesNotMatch(source, /drag=\{node,id,last:p,moved:false,target:null\};suppressStateClick=true/);
    assert.match(source, /if\(!drag\.moved\)\{drag\.moved=true;suppressStateClick=true;\}/);
    assert.match(source, /command:'selectState'/);
  });
});
