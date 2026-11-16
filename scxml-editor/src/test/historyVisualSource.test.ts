import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('History editor visuals', () => {
  test('supports shallow and deep history authoring and badges', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /Add history/);
    assert.match(source, /History type/);
    assert.match(source, /H\*/);
    assert.match(source, /createHistoryState/);
    assert.match(source, /updateHistoryState/);
  });
});
