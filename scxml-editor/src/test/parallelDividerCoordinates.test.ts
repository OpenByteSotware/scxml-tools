import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Parallel region divider coordinates', () => {
  test('uses absolute chart coordinates bounded by the parallel state', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /const x = \(\(childPosition\.x \+ childSize\.width\) \+ nextPosition\.x\) \/ 2;/);
    assert.match(source, /const y1 = parentPosition\.y \+ 68;/);
    assert.match(source, /const y2 = parentPosition\.y \+ parentSize\.height;/);
    assert.doesNotMatch(source, /nextPosition\.x\) \/ 2 - parentPosition\.x/);
  });
});
