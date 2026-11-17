import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Stage 4 generated webview regex', () => {
  test('double-escapes CR/LF so the outer HTML template cannot emit control characters into JavaScript', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.ok(source.includes(".value.split(/\\\\r?\\\\n/).filter(Boolean)"));
    assert.ok(!source.includes(".value.split(/\\r?\\n/).filter(Boolean)"));
  });
});
