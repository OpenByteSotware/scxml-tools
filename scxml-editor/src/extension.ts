import * as vscode from 'vscode';
import { parseScxml, ScxmlModel, StateNode } from './scxml';

const diagnostics = vscode.languages.createDiagnosticCollection('scxml');

export function activate(context: vscode.ExtensionContext): void {
  const provider = new StateChartEditorProvider();
  context.subscriptions.push(
    diagnostics,
    vscode.window.registerCustomEditorProvider('scxml.stateChart', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('scxml.openDiagram', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      if (uri) { await vscode.commands.executeCommand('vscode.openWith', uri, 'scxml.stateChart'); }
    }),
    vscode.commands.registerCommand('scxml.createDocument', createDocument),
    vscode.workspace.onDidOpenTextDocument(validateDocument),
    vscode.workspace.onDidChangeTextDocument(event => validateDocument(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri))
  );
  vscode.workspace.textDocuments.forEach(validateDocument);
}

export function deactivate(): void {}

async function createDocument(): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: 'scxml', content: sampleDocument() });
  await vscode.window.showTextDocument(document);
}

function validateDocument(document: vscode.TextDocument): void {
  if (document.languageId !== 'scxml' && !document.fileName.endsWith('.scxml')) { return; }
  const model = parseScxml(document.getText());
  diagnostics.set(document.uri, model.errors.map(message => new vscode.Diagnostic(
    new vscode.Range(0, 0, 0, Math.max(1, document.lineAt(0).text.length)), message, vscode.DiagnosticSeverity.Error
  )));
}

class StateChartEditorProvider implements vscode.CustomTextEditorProvider {
  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = { enableScripts: true };
    const update = () => { panel.webview.html = renderPage(parseScxml(document.getText()), document.fileName); };
    update();
    const change = vscode.workspace.onDidChangeTextDocument(event => { if (event.document.uri.toString() === document.uri.toString()) { update(); } });
    panel.onDidDispose(() => change.dispose());
    panel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'showSource') { await vscode.window.showTextDocument(document, { preview: false }); }
    });
  }
}

function renderPage(model: ScxmlModel, fileName: string): string {
  const allStates: StateNode[] = [];
  const collect = (state: StateNode) => { allStates.push(state); state.children.forEach(collect); };
  model.states.forEach(collect);
  const width = 920; const boxWidth = 210; const boxHeight = 86; const gapX = 70; const gapY = 55;
  const columns = Math.max(1, Math.floor(width / (boxWidth + gapX)));
  const positions = new Map<string, {x: number; y: number}>();
  allStates.forEach((state, index) => positions.set(state.id, { x: 35 + (index % columns) * (boxWidth + gapX), y: 50 + Math.floor(index / columns) * (boxHeight + gapY) }));
  const height = Math.max(300, 120 + Math.ceil(allStates.length / columns) * (boxHeight + gapY));
  const edges = allStates.flatMap(source => source.transitions.flatMap(transition => transition.targets.map(target => {
    const a = positions.get(source.id); const b = positions.get(target); if (!a || !b) { return ''; }
    const label = escapeHtml([transition.event, transition.cond ? `[${transition.cond}]` : ''].filter(Boolean).join(' '));
    return `<path d="M ${a.x + boxWidth} ${a.y + boxHeight / 2} C ${a.x + boxWidth + 45} ${a.y + boxHeight / 2}, ${b.x - 45} ${b.y + boxHeight / 2}, ${b.x} ${b.y + boxHeight / 2}" class="edge" marker-end="url(#arrow)"/><text x="${(a.x + b.x + boxWidth) / 2}" y="${(a.y + b.y + boxHeight) / 2 - 7}" class="label">${label}</text>`;
  })));
  const nodes = allStates.map(state => {
    const p = positions.get(state.id)!; const initial = model.initial === state.id ? ' initial' : '';
    return `<g><rect x="${p.x}" y="${p.y}" width="${boxWidth}" height="${boxHeight}" rx="14" class="node ${state.kind}${initial}"/><text x="${p.x + 16}" y="${p.y + 31}" class="title">${escapeHtml(state.id)}</text><text x="${p.x + 16}" y="${p.y + 57}" class="kind">${state.kind}</text></g>`;
  }).join('');
  const problems = model.errors.length ? `<div class="problems"><strong>Problems</strong><ul>${model.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : '<div class="ok">No structural problems found.</div>';
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}.bar{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border)}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:7px 12px;cursor:pointer}.canvas{overflow:auto;padding:12px}.node{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-focusBorder);stroke-width:2}.node.final{stroke:#3fb950;stroke-width:4}.node.parallel{stroke:#d29922}.node.initial{filter:drop-shadow(0 0 5px var(--vscode-focusBorder))}.title{fill:var(--vscode-foreground);font-size:15px;font-weight:600}.kind,.label{fill:var(--vscode-descriptionForeground);font-size:12px}.edge{fill:none;stroke:var(--vscode-descriptionForeground);stroke-width:1.6}.problems{margin:12px 16px;padding:10px;border-left:4px solid var(--vscode-errorForeground);background:var(--vscode-textBlockQuote-background)}.ok{margin:12px 16px;color:var(--vscode-testing-iconPassed)}
  </style></head><body><div class="bar"><strong>${escapeHtml(model.name || 'SCXML State Chart')}</strong><span>${escapeHtml(fileName)}</span><button id="source">Show XML Source</button></div>${problems}<div class="canvas"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="currentColor"/></marker></defs>${edges.join('')}${nodes}</svg></div><script>const vscode=acquireVsCodeApi();document.getElementById('source').addEventListener('click',()=>vscode.postMessage({command:'showSource'}));</script></body></html>`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function sampleDocument(): string { return `<?xml version="1.0" encoding="UTF-8"?>\n<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" name="DoorController" initial="closed">\n  <state id="closed">\n    <transition event="open" target="opened"/>\n  </state>\n  <state id="opened">\n    <transition event="close" target="closed"/>\n  </state>\n</scxml>\n`; }
