import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Transition type inference', () => {
  test('keeps parsed transition type narrowed to the SCXML union', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scxml.ts'), 'utf8');
    assert.match(source, /const transitions: Transition\[\]/);
    assert.match(source, /const type: Transition\['type'\]/);
    assert.match(source, /rawType === 'internal' \|\| rawType === 'external'/);
  });
});
