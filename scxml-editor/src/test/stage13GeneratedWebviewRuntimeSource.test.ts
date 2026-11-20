import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 13 generated webview runtime', () => {
  test('closes the incoming-transition navigation callback correctly', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /index:Number\(button\.dataset\.index\)\}\);\}\)\);document\.querySelectorAll\('\.completion-link'\)/);
    assert.doesNotMatch(source, /index:Number\(button\.dataset\.index\)\}\;\}\)\);/);
  });
});
