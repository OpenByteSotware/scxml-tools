import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 31 simulator close highlighting', () => {
  test('removes green simulation state and stops the host session on close', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    for (const token of [
      'const clearSimulationHighlight=',
      "querySelectorAll('.simulator-active-state').forEach(node=>node.classList.remove('simulator-active-state'))",
      "vscode.postMessage({command:'stopSimulation'})",
      "message.command === 'stopSimulation'",
      'clearSimulatorTimers(); simulator=undefined; return;'
    ]) assert.ok(source.includes(token), token);
    const closeStart = source.indexOf("getElementById('simulator-close')?.addEventListener");
    const closeEnd = source.indexOf("getElementById('simulator-reset')", closeStart);
    const closeHandler = source.slice(closeStart, closeEnd);
    assert.ok(closeHandler.includes('clearSimulationHighlight()'), closeHandler);
    assert.ok(closeHandler.includes("command:'stopSimulation'"), closeHandler);
  });
});
