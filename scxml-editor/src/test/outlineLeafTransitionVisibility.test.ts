import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Outline leaf-state transition visibility', () => {
  test('expands a simple state when it owns transitions or invokes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /state\.children\.length \|\| state\.transitions\.length \|\| \(invokeVisualsByState\.get\(state\.id\)\?\.length \?\? 0\) \? 'open' : ''/);
  });
});
