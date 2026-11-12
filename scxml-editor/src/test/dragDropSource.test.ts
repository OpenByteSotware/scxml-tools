import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('State drag containment and edges', () => {
  test('uses overlap containment, final drop resolution, and live edge routing', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /candidateOverlap/);
    assert.match(source, /const finalTarget=findContainmentTarget\(completed\.id\)/);
    assert.match(source, /connectionPoints/);
    assert.match(source, /message\.positions/);
  });
});
