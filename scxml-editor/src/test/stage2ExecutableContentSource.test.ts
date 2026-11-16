import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 2 executable content UI', () => {
  test('wires onentry, onexit, and transition action editors', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /On entry actions/);
    assert.match(source, /On exit actions/);
    assert.match(source, /Executable actions/);
    assert.match(source, /updateExecutableContent/);
    assert.match(source, /data-snippet="raise"/);
    assert.match(source, /data-snippet="log"/);
    assert.match(source, /data-snippet="assign"/);
    assert.match(source, /data-snippet="script"/);
  });
});
