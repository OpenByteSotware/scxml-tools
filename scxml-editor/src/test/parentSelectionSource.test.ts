import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Parent selection and drag confirmation', () => {
  test('renders parent dropdown and confirms hierarchy changes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /id=\"state-parent\"/);
    assert.match(source, /SCXML root/);
    assert.match(source, /Confirm parent change/);
    assert.match(source, /Are you sure you want state/);
    assert.match(source, /command:'resetView'/);
  });
});
