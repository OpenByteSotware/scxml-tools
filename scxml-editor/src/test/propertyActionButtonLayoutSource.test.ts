import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Property action button layout', () => {
  test('uses a bordered three-column grid that wraps additional buttons', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /\.actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(source, /\.actions button\{[^}]*width:100%[^}]*min-width:0/);
    assert.match(source, /\.actions button\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
    assert.match(source, /border:1px solid var\(--vscode-panel-border\)/);
    assert.match(source, /\.state-dialog \.actions,.transition-dialog \.actions\{grid-template-columns:repeat\(2/);
    assert.match(source, /button\{[^}]*border:1px solid var\(--vscode-button-border/);
  });
});
