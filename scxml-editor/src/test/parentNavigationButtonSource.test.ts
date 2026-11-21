import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Parent navigation toolbar button', () => {
  test('renders the dynamic parent button first with distinct styling', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    const toolbar = source.indexOf('<div class="bar">');
    const back = source.indexOf('id="back-parent"', toolbar);
    const xml = source.indexOf('id="source"', toolbar);
    assert.ok(back > toolbar, 'Back to Parent button is missing');
    assert.ok(xml > back, 'Back to Parent must appear before Show XML Source');
    assert.match(source, /parentUri \? '<button id="back-parent" class="parent-navigation-button"/);
    assert.match(source, /\.parent-navigation-button\{background:#6f42c1/);
    assert.match(source, /\.parent-navigation-button:hover\{background:#8250df/);
  });
});
