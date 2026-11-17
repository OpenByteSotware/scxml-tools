import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 5 validation initialization', () => {
  test('defines validateData before recursive state validation invokes it', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scxml.ts'), 'utf8');
    const definition = source.indexOf('const validateData =');
    const visitCall = source.indexOf('states.forEach(state => visit(state));');
    assert.ok(definition >= 0);
    assert.ok(visitCall >= 0);
    assert.ok(definition < visitCall);
  });
});
