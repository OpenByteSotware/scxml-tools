import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Final-state transition attachment', () => {
  test('uses compact dimensions and the circle circumference', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /state\.kind === 'final'.*width: 96, height: 96/);
    assert.match(source, /const circleConnectionPoint=/);
    assert.match(source, /radius=42/);
    assert.match(source, /target\.kind==='final'\?circleConnectionPoint\(target,source\)/);
  });
});
