export interface StateUpdate { oldId: string; id: string; kind: string; initial: boolean; parallel?: boolean; }
export interface TransitionUpdate { stateId: string; index: number; event: string; cond: string; targets: string; type?: '' | 'internal' | 'external'; }
export interface DoneDataUpdate { stateId: string; mode: 'none' | 'expr' | 'content' | 'params'; expression?: string; content?: string; params?: Array<{ name: string; expr?: string; location?: string }>; }

const stateTags = 'state|parallel|final|history';

function setAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, 'i');
  if (!value) { return tag.replace(pattern, ''); }
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return pattern.test(tag) ? tag.replace(pattern, `$1"${escaped}"`) : tag.replace(/\s*\/?>$/, match => ` ${name}="${escaped}"${match}`);
}

function findState(text: string, id: string): { start: number; openEnd: number; end: number; tag: string; kind: string } | undefined {
  const tagPattern = new RegExp(`<(${stateTags})\\b[^>]*\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\2[^>]*>`, 'gi');
  const match = tagPattern.exec(text); if (!match) { return undefined; }
  const start = match.index, openEnd = tagPattern.lastIndex, tag = match[0], kind = match[1];
  if (/\/\s*>$/.test(tag)) { return { start, openEnd, end: openEnd, tag, kind }; }
  const scanner = new RegExp(`<\\/?(?:${stateTags})\\b[^>]*>`, 'gi'); scanner.lastIndex = openEnd;
  let depth = 1; let token: RegExpExecArray | null;
  while ((token = scanner.exec(text))) {
    if (/^<\//.test(token[0])) { depth--; } else if (!/\/\s*>$/.test(token[0])) { depth++; }
    if (depth === 0) { return { start, openEnd, end: scanner.lastIndex, tag, kind }; }
  }
  return { start, openEnd, end: openEnd, tag, kind };
}

export function updateState(text: string, update: StateUpdate): string {
  const found = findState(text, update.oldId); if (!found) { throw new Error(`State ${update.oldId} was not found.`); }
  let openTag = setAttribute(found.tag, 'id', update.id.trim());
  const requestedKind = update.parallel === true
    ? 'parallel'
    : update.parallel === false && found.kind === 'parallel'
      ? 'state'
      : update.kind;
  if (requestedKind && requestedKind !== found.kind) {
    openTag = openTag.replace(new RegExp(`^<${found.kind}\\b`, 'i'), `<${requestedKind}`);
  }
  let result = text.slice(0, found.start) + openTag + text.slice(found.openEnd);
  if (requestedKind && requestedKind !== found.kind && found.end > found.openEnd) {
    const delta = openTag.length - found.tag.length;
    const closeStart = result.lastIndexOf(`</${found.kind}>`, found.end + delta);
    if (closeStart >= 0) {
      result = result.slice(0, closeStart) + `</${requestedKind}>` + result.slice(closeStart + found.kind.length + 3);
    }
  }
  if (update.oldId !== update.id) {
    result = result.replace(/\b(initial|target)\s*=\s*(["'])(.*?)\2/gi, (whole, name, quote, value) => {
      const values = String(value).split(/\s+/).map(v => v === update.oldId ? update.id : v);
      return `${name}=${quote}${values.join(' ')}${quote}`;
    });
  }
  result = setInitialInOwningScope(result, update.id, update.initial);
  return result;
}

function setInitialInOwningScope(text: string, stateId: string, initial: boolean): string {
  const state = findState(text, stateId);
  if (!state) { throw new Error(`State ${stateId} was not found after updating it.`); }
  const parent = findImmediateParent(text, state);
  if (parent) {
    const parentState = findState(text, parent.id);
    if (!parentState) { throw new Error(`Parent state ${parent.id} was not found.`); }
    // A parallel activates every direct region. Its children do not compete for one initial slot.
    if (parentState.kind === 'parallel') { return text; }
    const changed = initial
      ? setAttribute(parentState.tag, 'initial', stateId)
      : parentState.tag.replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
    return text.slice(0, parentState.start) + changed + text.slice(parentState.openEnd);
  }
  const root = /<scxml\b[^>]*>/i.exec(text);
  if (!root) { throw new Error('The SCXML root element was not found.'); }
  const changed = initial
    ? setAttribute(root[0], 'initial', stateId)
    : root[0].replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
  return text.slice(0, root.index) + changed + text.slice(root.index + root[0].length);
}

export function updateTransition(text: string, update: TransitionUpdate): string {
  const found = findState(text, update.stateId); if (!found) { throw new Error(`State ${update.stateId} was not found.`); }
  const region = text.slice(found.openEnd, found.end);
  const transition = /<transition\b[^>]*>/gi; let match: RegExpExecArray | null; let index = 0;
  while ((match = transition.exec(region))) {
    if (index++ !== update.index) { continue; }
    let tag = setAttribute(match[0], 'event', update.event.trim());
    tag = setAttribute(tag, 'cond', update.cond.trim());
    tag = setAttribute(tag, 'target', update.targets.trim());
    tag = setAttribute(tag, 'type', update.type === 'internal' || update.type === 'external' ? update.type : '');
    const start = found.openEnd + match.index;
    return text.slice(0, start) + tag + text.slice(start + match[0].length);
  }
  throw new Error(`Transition ${update.index + 1} was not found in state ${update.stateId}.`);
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export interface NewState { id: string; kind: string; initial: boolean; }
export interface NewTransition { stateId: string; event: string; cond: string; targets: string; type?: '' | 'internal' | 'external'; }

export function createState(text: string, state: NewState): string {
  const id = state.id.trim();
  if (!id) { throw new Error('State ID is required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const rootOpen = /<scxml\b[^>]*>/i.exec(text);
  if (!rootOpen) { throw new Error('The SCXML root element was not found.'); }
  const rootClose = text.lastIndexOf('</scxml>');
  if (rootClose < 0) { throw new Error('The SCXML closing element was not found.'); }
  const kind = /^(state|parallel|final|history)$/.test(state.kind) ? state.kind : 'state';
  const indentMatch = /\n([ \t]*)<(?:state|parallel|final|history)\b/.exec(text);
  const indent = indentMatch?.[1] ?? '  ';
  const element = `\n${indent}<${kind} id="${escapeXml(id)}"/>`;
  let result = text.slice(0, rootClose) + element + '\n' + text.slice(rootClose);
  if (state.initial) {
    const updatedRoot = setAttribute(rootOpen[0], 'initial', id);
    result = result.slice(0, rootOpen.index) + updatedRoot + result.slice(rootOpen.index + rootOpen[0].length);
  }
  return result;
}

export function deleteState(text: string, id: string): string {
  const found = findState(text, id);
  if (!found) { throw new Error(`State ${id} was not found.`); }
  let start = found.start;
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) { start--; }
  if (start > 0 && text[start - 1] === '\n') { start--; }
  let result = text.slice(0, start) + text.slice(found.end);
  result = result.replace(/\s+initial\s*=\s*(["'])(.*?)\1/gi, (whole, quote, value) => value === id ? '' : whole);
  result = result.replace(/<transition\b[^>]*>/gi, tag => {
    const target = /\btarget\s*=\s*(["'])(.*?)\1/i.exec(tag);
    if (!target) { return tag; }
    const remaining = target[2].split(/\s+/).filter((value: string) => value && value !== id);
    return setAttribute(tag, 'target', remaining.join(' '));
  });
  return result;
}

export function createTransition(text: string, transition: NewTransition): string {
  const found = findState(text, transition.stateId);
  if (!found) { throw new Error(`State ${transition.stateId} was not found.`); }
  let tag = '<transition/>';
  tag = setAttribute(tag, 'event', transition.event.trim());
  tag = setAttribute(tag, 'cond', transition.cond.trim());
  tag = setAttribute(tag, 'target', transition.targets.trim());
  tag = setAttribute(tag, 'type', transition.type === 'internal' || transition.type === 'external' ? transition.type : '');
  if (/\/\s*>$/.test(found.tag)) {
    const open = found.tag.replace(/\/\s*>$/, '>');
    const replacement = `${open}\n    ${tag}\n  </${found.kind}>`;
    return text.slice(0, found.start) + replacement + text.slice(found.openEnd);
  }
  const insertion = `\n    ${tag}`;
  return text.slice(0, found.openEnd) + insertion + text.slice(found.openEnd);
}

export function deleteTransition(text: string, stateId: string, transitionIndex: number): string {
  const found = findState(text, stateId);
  if (!found) { throw new Error(`State ${stateId} was not found.`); }
  const region = text.slice(found.openEnd, found.end);
  const pattern = /<transition\b[^>]*(?:\/>|>[\s\S]*?<\/transition>)/gi;
  let match: RegExpExecArray | null; let index = 0;
  while ((match = pattern.exec(region))) {
    if (index++ !== transitionIndex) { continue; }
    let start = found.openEnd + match.index;
    while (start > found.openEnd && (text[start - 1] === ' ' || text[start - 1] === '\t')) { start--; }
    if (start > found.openEnd && text[start - 1] === '\n') { start--; }
    return text.slice(0, start) + text.slice(found.openEnd + match.index + match[0].length);
  }
  throw new Error(`Transition ${transitionIndex + 1} was not found in state ${stateId}.`);
}

function escapeXml(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export interface NewChildState { parentId: string; id: string; kind: string; initial: boolean; }

export function createChildState(text: string, child: NewChildState): string {
  const parent = findState(text, child.parentId);
  if (!parent) { throw new Error(`Parent state ${child.parentId} was not found.`); }
  const depth = getStateDepth(text, child.parentId);
  if (depth >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }
  if (parent.kind === 'final' || parent.kind === 'history') { throw new Error(`${parent.kind} cannot contain child states.`); }
  const id = child.id.trim();
  if (!id) { throw new Error('Child state ID is required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const kind = /^(state|parallel|final|history)$/.test(child.kind) ? child.kind : 'state';
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const childIndent = parentIndent + '  ';
  let openTag = parent.tag;
  if (child.initial && parent.kind === 'state') { openTag = setAttribute(openTag, 'initial', id); }
  const childElement = `${childIndent}<${kind} id="${escapeXml(id)}"/>`;
  if (/\/\s*>$/.test(parent.tag)) {
    openTag = openTag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${openTag}\n${childElement}\n${parentIndent}</${parent.kind}>` + text.slice(parent.openEnd);
  }
  return text.slice(0, parent.start) + openTag + text.slice(parent.openEnd, parent.end - (`</${parent.kind}>`).length) + `\n${childElement}\n${parentIndent}` + text.slice(parent.end - (`</${parent.kind}>`).length);
}

export interface NewParallelRegion { parallelId: string; regionId: string; initialStateId: string; }

export function createParallelRegion(text: string, region: NewParallelRegion): string {
  const parallelId = String(region?.parallelId ?? '').trim();
  const parent = findState(text, parallelId);
  if (!parent) { throw new Error(`Parallel state ${parallelId} was not found.`); }
  if (parent.kind !== 'parallel') { throw new Error(`${parallelId} is not a parallel state.`); }
  const regionId = String(region?.regionId ?? '').trim();
  const initialId = String(region?.initialStateId ?? '').trim();
  if (!regionId || !initialId) { throw new Error('Region ID and initial state ID are required.'); }
  if (findState(text, regionId)) { throw new Error(`State ${regionId} already exists.`); }
  if (findState(text, initialId)) { throw new Error(`State ${initialId} already exists.`); }
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const regionIndent = parentIndent + '  ';
  const childIndent = regionIndent + '  ';
  const element = `${regionIndent}<state id="${escapeXml(regionId)}" initial="${escapeXml(initialId)}">\n${childIndent}<state id="${escapeXml(initialId)}"/>\n${regionIndent}</state>`;
  if (/\/\s*>$/.test(parent.tag)) {
    const open = parent.tag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${open}\n${element}\n${parentIndent}</parallel>` + text.slice(parent.openEnd);
  }
  const close = `</parallel>`;
  const closeStart = parent.end - close.length;
  return text.slice(0, closeStart) + `\n${element}\n${parentIndent}` + text.slice(closeStart);
}


export interface NewHistoryState { parentId: string; id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }
export interface HistoryUpdate { id: string; historyType: 'shallow' | 'deep'; defaultTarget?: string; }

export function createHistoryState(text: string, history: NewHistoryState): string {
  const parentId = String(history.parentId ?? '').trim();
  const id = String(history.id ?? '').trim();
  const type = history.historyType === 'deep' ? 'deep' : 'shallow';
  const target = String(history.defaultTarget ?? '').trim();
  if (!parentId || !id) { throw new Error('History parent and ID are required.'); }
  if (findState(text, id)) { throw new Error(`State ${id} already exists.`); }
  const parent = findState(text, parentId);
  if (!parent) { throw new Error(`History parent ${parentId} was not found.`); }
  if (parent.kind !== 'state' && parent.kind !== 'parallel') { throw new Error('History may only be added to state or parallel containers.'); }
  if (target && !findState(text, target)) { throw new Error(`Default history target ${target} was not found.`); }
  const parentLine = text.lastIndexOf('\n', parent.start) + 1;
  const parentIndent = text.slice(parentLine, parent.start).match(/^[ \t]*/)?.[0] ?? '';
  const indent = parentIndent + '  ';
  const transition = target ? `\n${indent}  <transition target="${escapeXml(target)}"/>\n${indent}` : '';
  const element = `${indent}<history id="${escapeXml(id)}" type="${type}">${transition}</history>`;
  if (/\/\s*>$/.test(parent.tag)) {
    const open = parent.tag.replace(/\/\s*>$/, '>');
    return text.slice(0, parent.start) + `${open}\n${element}\n${parentIndent}</${parent.kind}>` + text.slice(parent.openEnd);
  }
  const close = `</${parent.kind}>`; const closeStart = parent.end - close.length;
  return text.slice(0, closeStart) + `\n${element}\n${parentIndent}` + text.slice(closeStart);
}

export function updateHistoryState(text: string, update: HistoryUpdate): string {
  const found = findState(text, update.id);
  if (!found || found.kind !== 'history') { throw new Error(`History ${update.id} was not found.`); }
  let tag = setAttribute(found.tag, 'type', update.historyType === 'deep' ? 'deep' : 'shallow');
  let result = text.slice(0, found.start) + tag + text.slice(found.openEnd);
  const refreshed = findState(result, update.id)!;
  const target = String(update.defaultTarget ?? '').trim();
  if (target && !findState(result, target)) { throw new Error(`Default history target ${target} was not found.`); }
  const body = result.slice(refreshed.openEnd, refreshed.end);
  const transition = /<transition\b[^>]*\/?\s*>/i.exec(body);
  if (transition) {
    const changed = setAttribute(transition[0], 'target', target);
    const start = refreshed.openEnd + transition.index;
    return result.slice(0, start) + changed + result.slice(start + transition[0].length);
  }
  if (!target) { return result; }
  const close = '</history>'; const closeStart = refreshed.end - close.length;
  return result.slice(0, closeStart) + `\n    <transition target="${escapeXml(target)}"/>\n  ` + result.slice(closeStart);
}
export function getStateDepth(text: string, id: string): number {
  const target = findState(text, id);
  if (!target) { throw new Error(`State ${id} was not found.`); }
  const scanner = new RegExp(`<\\/?(?:${stateTags})\\b[^>]*>`, 'gi');
  let depth = 0; let token: RegExpExecArray | null;
  while ((token = scanner.exec(text)) && token.index < target.start) {
    if (/^<\//.test(token[0])) { depth = Math.max(0, depth - 1); }
    else if (!/\/\s*>$/.test(token[0])) { depth++; }
  }
  return depth;
}

export interface ReparentStateRequest { stateId: string; newParentId?: string; }

export function reparentState(text: string, request: ReparentStateRequest): string {
  const stateId = String(request.stateId ?? '').trim();
  const newParentId = String(request.newParentId ?? '').trim();
  if (!stateId) { throw new Error('State ID is required.'); }
  if (stateId === newParentId) { throw new Error('A state cannot contain itself.'); }

  const source = findState(text, stateId);
  if (!source) { throw new Error(`State ${stateId} was not found.`); }
  const parent = newParentId ? findState(text, newParentId) : undefined;
  if (newParentId && !parent) { throw new Error(`Destination state ${newParentId} was not found.`); }
  if (parent && (parent.kind === 'final' || parent.kind === 'history')) { throw new Error(`${parent.kind} cannot contain child states.`); }
  if (parent && parent.start >= source.start && parent.end <= source.end) { throw new Error('A state cannot be moved into one of its descendants.'); }
  if (parent && getStateDepth(text, newParentId) >= 64) { throw new Error('The editor supports a maximum state nesting depth of 64.'); }

  const oldParent = findImmediateParent(text, source);
  if ((oldParent?.id ?? '') === newParentId) { return text; }

  let removeStart = source.start;
  while (removeStart > 0 && (text[removeStart - 1] === ' ' || text[removeStart - 1] === '\t')) { removeStart--; }
  if (removeStart > 0 && text[removeStart - 1] === '\n') { removeStart--; }
  let removeEnd = source.end;
  if (removeEnd < text.length && text[removeEnd] === '\r') { removeEnd++; }
  if (removeEnd < text.length && text[removeEnd] === '\n') { removeEnd++; }

  const sourceXml = text.slice(source.start, source.end);
  let without = text.slice(0, removeStart) + text.slice(removeEnd);
  if (oldParent) {
    const refreshedOldParent = findState(without, oldParent.id);
    if (refreshedOldParent) {
      const changedTag = refreshedOldParent.tag.replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
      without = without.slice(0, refreshedOldParent.start) + changedTag + without.slice(refreshedOldParent.openEnd);
    }
  } else {
    const root = /<scxml\b[^>]*>/i.exec(without);
    if (root) {
      const changed = root[0].replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(stateId)}\\2`, 'i'), '');
      without = without.slice(0, root.index) + changed + without.slice(root.index + root[0].length);
    }
  }

  if (!newParentId) {
    const rootClose = without.lastIndexOf('</scxml>');
    if (rootClose < 0) { throw new Error('The SCXML closing element was not found.'); }
    const normalized = normalizeIndent(sourceXml, '  ');
    const separator = rootClose > 0 && without[rootClose - 1] === '\n' ? '' : '\n';
    return without.slice(0, rootClose) + separator + normalized + '\n' + without.slice(rootClose);
  }

  const destination = findState(without, newParentId);
  if (!destination) { throw new Error(`Destination state ${newParentId} was not found after moving the source.`); }
  const parentLine = without.lastIndexOf('\n', destination.start) + 1;
  const parentIndent = without.slice(parentLine, destination.start).match(/^[ \t]*/)?.[0] ?? '';
  const normalized = normalizeIndent(sourceXml, parentIndent + '  ');

  if (/\/\s*>$/.test(destination.tag)) {
    const open = destination.tag.replace(/\/\s*>$/, '>');
    const replacement = `${open}\n${normalized}\n${parentIndent}</${destination.kind}>`;
    return without.slice(0, destination.start) + replacement + without.slice(destination.openEnd);
  }
  const close = `</${destination.kind}>`;
  const closeStart = destination.end - close.length;
  return without.slice(0, closeStart) + `${normalized}\n${parentIndent}` + without.slice(closeStart);
}

function normalizeIndent(xml: string, indent: string): string {
  const lines = xml.split(/\r?\n/);
  const nonBlank = lines.filter(line => line.trim().length > 0);
  const common = nonBlank.length ? Math.min(...nonBlank.map(line => line.match(/^[ \t]*/)?.[0].length ?? 0)) : 0;
  return lines.map(line => indent + line.slice(Math.min(common, line.length))).join('\n');
}

function findImmediateParent(text: string, source: { start: number; end: number }): { id: string; start: number; end: number } | undefined {
  const pattern = new RegExp(`<(${stateTags})\\b[^>]*\\bid\\s*=\\s*(["'])(.*?)\\2[^>]*>`, 'gi');
  let match: RegExpExecArray | null;
  let best: { id: string; start: number; end: number } | undefined;
  while ((match = pattern.exec(text)) && match.index < source.start) {
    const candidate = findState(text, match[3]);
    if (!candidate || candidate.start === source.start) { continue; }
    if (candidate.start < source.start && candidate.end >= source.end && (!best || candidate.start > best.start)) {
      best = { id: match[3], start: candidate.start, end: candidate.end };
    }
  }
  return best;
}

export interface RootPropertiesUpdate {
  name?: string;
  version: string;
  namespace: string;
  datamodel?: string;
  binding?: string;
  xmlBase?: string;
  initialTarget?: string;
  explicitInitial: boolean;
  initialCond?: string;
}

export interface ExplicitInitialUpdate {
  scopeId?: string;
  target: string;
  cond?: string;
  explicit: boolean;
}

export function updateRootProperties(text: string, update: RootPropertiesUpdate): string {
  const root = /<scxml\b[^>]*>/i.exec(text);
  if (!root) { throw new Error('The SCXML root element was not found.'); }
  const target = String(update.initialTarget ?? '').trim();
  if (target && !findState(text, target)) { throw new Error(`Initial target ${target} was not found.`); }
  let tag = root[0];
  tag = setAttribute(tag, 'version', update.version.trim() || '1.0');
  tag = setAttribute(tag, 'xmlns', update.namespace.trim() || 'http://www.w3.org/2005/07/scxml');
  tag = setAttribute(tag, 'name', String(update.name ?? '').trim());
  tag = setAttribute(tag, 'datamodel', String(update.datamodel ?? '').trim());
  tag = setAttribute(tag, 'binding', String(update.binding ?? '').trim());
  tag = setAttribute(tag, 'xml:base', String(update.xmlBase ?? '').trim());
  tag = setAttribute(tag, 'initial', update.explicitInitial ? '' : target);
  let result = text.slice(0, root.index) + tag + text.slice(root.index + root[0].length);
  return setExplicitInitialElement(result, undefined, target, String(update.initialCond ?? '').trim(), update.explicitInitial);
}

export function updateExplicitInitial(text: string, update: ExplicitInitialUpdate): string {
  const target = String(update.target ?? '').trim();
  if (!target) { throw new Error('Initial transition target is required.'); }
  if (!findState(text, target)) { throw new Error(`Initial target ${target} was not found.`); }
  return setExplicitInitialElement(text, update.scopeId, target, String(update.cond ?? '').trim(), update.explicit);
}

function setExplicitInitialElement(text: string, scopeId: string | undefined, target: string, cond: string, explicit: boolean): string {
  const scope = scopeId ? findState(text, scopeId) : undefined;
  const root = !scopeId ? /<scxml\b[^>]*>/i.exec(text) : undefined;
  if (scopeId && !scope) { throw new Error(`State ${scopeId} was not found.`); }
  const openStart = scope ? scope.start : root!.index;
  const openEnd = scope ? scope.openEnd : root!.index + root![0].length;
  const closeName = scope ? scope.kind : 'scxml';
  const scopeEnd = scope ? scope.end : text.lastIndexOf('</scxml>') + '</scxml>'.length;
  let openTag = scope ? scope.tag : root![0];
  openTag = setAttribute(openTag, 'initial', explicit ? '' : target);
  let result = text.slice(0, openStart) + openTag + text.slice(openEnd);
  const delta = openTag.length - (scope ? scope.tag.length : root![0].length);
  const adjustedOpenEnd = openEnd + delta;
  const adjustedScopeEnd = scopeEnd + delta;
  const body = result.slice(adjustedOpenEnd, adjustedScopeEnd);
  const initialPattern = /<initial\b[^>]*>[\s\S]*?<\/initial\s*>/i;
  const existing = initialPattern.exec(body);
  if (!explicit) {
    if (!existing) { return result; }
    const start = adjustedOpenEnd + existing.index;
    return result.slice(0, start) + result.slice(start + existing[0].length);
  }
  if (!target) { throw new Error('Explicit initial transition requires a target.'); }
  let transition = '<transition/>';
  transition = setAttribute(transition, 'target', target);
  transition = setAttribute(transition, 'cond', cond);
  const lineStart = result.lastIndexOf('\n', openStart) + 1;
  const parentIndent = result.slice(lineStart, openStart).match(/^[ \t]*/)?.[0] ?? '';
  const element = `${parentIndent}  <initial>\n${parentIndent}    ${transition}\n${parentIndent}  </initial>`;
  if (existing) {
    const start = adjustedOpenEnd + existing.index;
    return result.slice(0, start) + element + result.slice(start + existing[0].length);
  }
  if (/\/\s*>$/.test(openTag)) {
    const expanded = openTag.replace(/\/\s*>$/, '>');
    return result.slice(0, openStart) + `${expanded}\n${element}\n${parentIndent}</${closeName}>` + result.slice(adjustedOpenEnd);
  }
  return result.slice(0, adjustedOpenEnd) + `\n${element}` + result.slice(adjustedOpenEnd);
}


export type ExecutableContentLocation = 'onentry' | 'onexit' | 'transition';
export interface ExecutableContentUpdate {
  stateId: string;
  location: ExecutableContentLocation;
  transitionIndex?: number;
  xml: string;
}

const executableElementNames = new Set(['raise', 'log', 'assign', 'script', 'if', 'elseif', 'else', 'foreach', 'send', 'cancel', 'param', 'content']);

export function readExecutableContent(text: string, stateId: string, location: ExecutableContentLocation, transitionIndex = 0): string {
  const state = findState(text, stateId);
  if (!state) { throw new Error(`State ${stateId} was not found.`); }
  const body = text.slice(state.openEnd, state.end - (state.end > state.openEnd ? (`</${state.kind}>`).length : 0));
  if (location === 'transition') {
    const transition = findDirectChildElement(body, 'transition', transitionIndex);
    return transition ? transition.inner.trim() : '';
  }
  const block = findDirectChildElement(body, location, 0);
  return block ? block.inner.trim() : '';
}

export function updateExecutableContent(text: string, update: ExecutableContentUpdate): string {
  const state = findState(text, update.stateId);
  if (!state) { throw new Error(`State ${update.stateId} was not found.`); }
  if (state.kind === 'history' && update.location !== 'transition') { throw new Error('History states do not support onentry or onexit content.'); }
  const xml = String(update.xml ?? '').trim();
  validateExecutableFragment(xml);
  if (update.location === 'transition') {
    return replaceTransitionExecutableContent(text, state, update.transitionIndex ?? 0, xml);
  }
  return replaceStateExecutableBlock(text, state, update.location, xml);
}

function validateExecutableFragment(xml: string): void {
  if (!xml) { return; }
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...withoutComments.matchAll(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g)];
  if (!tags.length) { throw new Error('Executable content must contain SCXML action elements.'); }
  for (const tag of tags) {
    const name = tag[1].includes(':') ? tag[1] : tag[1].toLowerCase();
    if (!tag[0].startsWith('</') && !executableElementNames.has(name) && !name.includes(':')) {
      throw new Error(`Executable content supports raise, log, assign, script, if, elseif, else, foreach, send, cancel, param, content, and namespaced extension actions; found ${tag[1]}.`);
    }
  }
  const stack: string[] = [];
  for (const tag of tags) {
    const closing = tag[0].startsWith('</');
    const selfClosing = /\/\s*>$/.test(tag[0]);
    const name = tag[1];
    if (closing) {
      if (stack.pop() !== name) { throw new Error(`Executable content has a mismatched closing tag: ${name}.`); }
    } else if (!selfClosing) { stack.push(name); }
  }
  if (stack.length) { throw new Error(`Executable content has an unclosed element: ${stack[stack.length - 1]}.`); }
  for (const match of withoutComments.matchAll(/<raise\b([^>]*)\/?\s*>/gi)) {
    if (!/\bevent\s*=/.test(match[1])) { throw new Error('raise requires an event attribute.'); }
  }
  for (const match of withoutComments.matchAll(/<assign\b([^>]*)\/?\s*>/gi)) {
    if (!/\blocation\s*=/.test(match[1])) { throw new Error('assign requires a location attribute.'); }
  }
  for (const match of withoutComments.matchAll(/<script\b([^>]*)\/?\s*>/gi)) {
    const source = /\bsrc\s*=/.test(match[1]);
    if (source && !/\/\s*>$/.test(match[0])) { throw new Error('A script with src must not also contain inline script content.'); }
  }
  for (const match of withoutComments.matchAll(/<if\b([^>]*)>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { throw new Error('if requires a cond attribute.'); }
    if (/\/\s*>$/.test(match[0])) { throw new Error('if must contain executable content and use a closing if element.'); }
  }
  for (const match of withoutComments.matchAll(/<elseif\b([^>]*)\/?\s*>/gi)) {
    if (!/\bcond\s*=/.test(match[1])) { throw new Error('elseif requires a cond attribute.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('elseif must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<else\b([^>]*)\/?\s*>/gi)) {
    if (!/\/\s*>$/.test(match[0])) { throw new Error('else must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<foreach\b([^>]*)>/gi)) {
    if (!/\barray\s*=/.test(match[1])) { throw new Error('foreach requires an array attribute.'); }
    if (!/\bitem\s*=/.test(match[1])) { throw new Error('foreach requires an item attribute.'); }
    if (/\/\s*>$/.test(match[0])) { throw new Error('foreach must contain executable content and use a closing foreach element.'); }
  }
  for (const match of withoutComments.matchAll(/<send\b([^>]*)>/gi)) {
    const attrs = match[1];
    validateExclusiveAttributePair(attrs, 'event', 'eventexpr', 'send');
    validateExclusiveAttributePair(attrs, 'target', 'targetexpr', 'send');
    validateExclusiveAttributePair(attrs, 'type', 'typeexpr', 'send');
    validateExclusiveAttributePair(attrs, 'id', 'idlocation', 'send');
    validateExclusiveAttributePair(attrs, 'delay', 'delayexpr', 'send');
    if (!/\bevent(?:expr)?\s*=/.test(attrs)) { throw new Error('send requires event or eventexpr.'); }
  }
  for (const match of withoutComments.matchAll(/<cancel\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1];
    validateExclusiveAttributePair(attrs, 'sendid', 'sendidexpr', 'cancel');
    if (!/\bsendid(?:expr)?\s*=/.test(attrs)) { throw new Error('cancel requires sendid or sendidexpr.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('cancel must be empty and self-closing.'); }
  }
  for (const match of withoutComments.matchAll(/<param\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1];
    if (!/\bname\s*=/.test(attrs)) { throw new Error('param requires a name attribute.'); }
    validateExclusiveAttributePair(attrs, 'expr', 'location', 'param');
    if (!/\b(?:expr|location)\s*=/.test(attrs)) { throw new Error('param requires expr or location.'); }
    if (!/\/\s*>$/.test(match[0])) { throw new Error('param must be empty and self-closing.'); }
  }
  validateSendChildren(withoutComments);
  validateConditionalPlacement(withoutComments);
}



function validateExclusiveAttributePair(attrs: string, literal: string, expression: string, element: string): void {
  if (new RegExp(`\\b${literal}\\s*=`).test(attrs) && new RegExp(`\\b${expression}\\s*=`).test(attrs)) {
    throw new Error(`${element} cannot define both ${literal} and ${expression}.`);
  }
}

function validateSendChildren(xml: string): void {
  for (const match of xml.matchAll(/<send\b[^>]*>([\s\S]*?)<\/send\s*>/gi)) {
    const body = match[1];
    const contentCount = (body.match(/<content\b/gi) || []).length;
    const paramCount = (body.match(/<param\b/gi) || []).length;
    if (contentCount > 1) { throw new Error('send may contain at most one content element.'); }
    if (contentCount && paramCount) { throw new Error('send cannot contain both content and param elements.'); }
  }
}

function validateConditionalPlacement(xml: string): void {
  const tokenPattern = /<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g;
  const stack: Array<{ name: string; elseSeen: boolean }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];
    const name = match[1].toLowerCase();
    const closing = token.startsWith('</');
    const selfClosing = /\/\s*>$/.test(token);
    if (closing) { stack.pop(); continue; }
    if (name === 'elseif' || name === 'else') {
      const parentIf = [...stack].reverse().find(entry => entry.name === 'if');
      if (!parentIf || stack[stack.length - 1] !== parentIf) { throw new Error(`${name} must be a direct child of if.`); }
      if (parentIf.elseSeen) { throw new Error(`${name} cannot appear after else.`); }
      if (name === 'else') { parentIf.elseSeen = true; }
      continue;
    }
    if (!selfClosing) { stack.push({ name, elseSeen: false }); }
  }
}

function replaceStateExecutableBlock(text: string, state: ReturnType<typeof findState> & {}, location: 'onentry' | 'onexit', xml: string): string {
  const close = `</${state.kind}>`;
  if (/\/\s*>$/.test(state.tag)) {
    if (!xml) { return text; }
    const lineStart = text.lastIndexOf('\n', state.start) + 1;
    const indent = text.slice(lineStart, state.start).match(/^[ \t]*/)?.[0] ?? '';
    const open = state.tag.replace(/\/\s*>$/, '>');
    const block = formatExecutableBlock(location, xml, indent + '  ');
    return text.slice(0, state.start) + `${open}\n${block}\n${indent}${close}` + text.slice(state.openEnd);
  }
  const bodyStart = state.openEnd;
  const bodyEnd = state.end - close.length;
  const body = text.slice(bodyStart, bodyEnd);
  const existing = findDirectChildElement(body, location, 0);
  if (existing) {
    const start = bodyStart + existing.start;
    if (!xml) { return text.slice(0, start) + text.slice(bodyStart + existing.end); }
    const lineStart = text.lastIndexOf('\n', start) + 1;
    const indent = text.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? '';
    const replacement = formatExecutableBlock(location, xml, indent);
    return text.slice(0, start) + replacement + text.slice(bodyStart + existing.end);
  }
  if (!xml) { return text; }
  const lineStart = text.lastIndexOf('\n', state.start) + 1;
  const parentIndent = text.slice(lineStart, state.start).match(/^[ \t]*/)?.[0] ?? '';
  const block = formatExecutableBlock(location, xml, parentIndent + '  ');
  return location === 'onentry'
    ? text.slice(0, bodyStart) + `\n${block}` + text.slice(bodyStart)
    : text.slice(0, bodyEnd) + `\n${block}\n${parentIndent}` + text.slice(bodyEnd);
}

function replaceTransitionExecutableContent(text: string, state: ReturnType<typeof findState> & {}, transitionIndex: number, xml: string): string {
  const close = state.end > state.openEnd ? `</${state.kind}>` : '';
  const bodyStart = state.openEnd;
  const bodyEnd = state.end - close.length;
  const body = text.slice(bodyStart, bodyEnd);
  const transition = findDirectChildElement(body, 'transition', transitionIndex);
  if (!transition) { throw new Error(`Transition ${transitionIndex + 1} was not found in the selected state.`); }
  const absoluteStart = bodyStart + transition.start;
  const original = text.slice(absoluteStart, bodyStart + transition.end);
  const openTag = /^<transition\b[^>]*>/i.exec(original)?.[0];
  if (!openTag) { throw new Error('Transition opening element was not found.'); }
  if (!xml) {
    const emptyTag = openTag.replace(/>$/, '/>');
    return text.slice(0, absoluteStart) + emptyTag + text.slice(bodyStart + transition.end);
  }
  const lineStart = text.lastIndexOf('\n', absoluteStart) + 1;
  const indent = text.slice(lineStart, absoluteStart).match(/^[ \t]*/)?.[0] ?? '';
  const normalizedOpen = openTag.replace(/\/\s*>$/, '>');
  const content = indentFragment(xml, indent + '  ');
  const replacement = `${normalizedOpen}\n${content}\n${indent}</transition>`;
  return text.slice(0, absoluteStart) + replacement + text.slice(bodyStart + transition.end);
}

function formatExecutableBlock(location: 'onentry' | 'onexit', xml: string, indent: string): string {
  return `${indent}<${location}>\n${indentFragment(xml, indent + '  ')}\n${indent}</${location}>`;
}

function indentFragment(xml: string, indent: string): string {
  const lines = xml.trim().split(/\r?\n/);
  const nonBlank = lines.filter(line => line.trim());
  const common = nonBlank.length ? Math.min(...nonBlank.map(line => line.match(/^[ \t]*/)?.[0].length ?? 0)) : 0;
  return lines.map(line => indent + line.slice(Math.min(common, line.length))).join('\n');
}

function findDirectChildElement(body: string, name: string, requestedIndex: number): { start: number; end: number; inner: string } | undefined {
  const token = /<\/?(?:state|parallel|final|history|initial|transition|onentry|onexit)\b[^>]*>/gi;
  let depth = 0; let index = 0; let match: RegExpExecArray | null;
  while ((match = token.exec(body))) {
    const closing = /^<\//.test(match[0]); const selfClosing = /\/\s*>$/.test(match[0]);
    const elementName = /^<\/?([\w:-]+)/.exec(match[0])?.[1]?.toLowerCase();
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && elementName === name) {
      if (index++ !== requestedIndex) { if (!selfClosing) { depth++; } continue; }
      if (selfClosing) { return { start: match.index, end: token.lastIndex, inner: '' }; }
      const closePattern = new RegExp(`</${name}\\s*>`, 'ig'); closePattern.lastIndex = token.lastIndex;
      const close = closePattern.exec(body);
      if (!close) { return undefined; }
      return { start: match.index, end: closePattern.lastIndex, inner: body.slice(token.lastIndex, close.index) };
    }
    if (!selfClosing) { depth++; }
  }
  return undefined;
}


export function readDoneData(text: string, stateId: string): DoneDataUpdate {
  const state = findState(text, stateId);
  if (!state || state.kind !== 'final') { return { stateId, mode: 'none' }; }
  const body = text.slice(state.openEnd, state.end - '</final>'.length);
  const done = /<donedata\b[^>]*>([\s\S]*?)<\/donedata\s*>/i.exec(body);
  if (!done) { return { stateId, mode: 'none' }; }
  const content = /<content\b([^>]*)>([\s\S]*?)<\/content\s*>|<content\b([^>]*)\/>/i.exec(done[1]);
  if (content) {
    const attrs = content[1] || content[3] || '';
    const expr = /\bexpr\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2];
    return expr !== undefined ? { stateId, mode: 'expr', expression: expr } : { stateId, mode: 'content', content: (content[2] || '').trim() };
  }
  const params = [...done[1].matchAll(/<param\b([^>]*)\/>/gi)].map(match => ({
    name: /\bname\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2] || '',
    expr: /\bexpr\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2],
    location: /\blocation\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2]
  }));
  return params.length ? { stateId, mode: 'params', params } : { stateId, mode: 'none' };
}

export function updateDoneData(text: string, update: DoneDataUpdate): string {
  const state = findState(text, update.stateId);
  if (!state || state.kind !== 'final') { throw new Error(`Final state ${update.stateId} was not found.`); }
  const mode = update.mode || 'none';
  let inner = '';
  if (mode === 'expr') {
    const expression = String(update.expression ?? '').trim();
    if (!expression) { throw new Error('Done-data expression is required.'); }
    inner = `<content expr="${escapeXml(expression)}"/>`;
  } else if (mode === 'content') {
    const content = String(update.content ?? '').trim();
    if (!content) { throw new Error('Done-data inline content is required.'); }
    inner = `<content>${content}</content>`;
  } else if (mode === 'params') {
    const params = update.params ?? [];
    if (!params.length) { throw new Error('At least one done-data parameter is required.'); }
    inner = params.map(param => {
      const name = String(param.name ?? '').trim(), expr = String(param.expr ?? '').trim(), location = String(param.location ?? '').trim();
      if (!name) { throw new Error('Each done-data parameter requires a name.'); }
      if ((expr ? 1 : 0) + (location ? 1 : 0) !== 1) { throw new Error(`Done-data parameter ${name} requires exactly one of expr or location.`); }
      return `<param name="${escapeXml(name)}" ${expr ? `expr="${escapeXml(expr)}"` : `location="${escapeXml(location)}"`}/>`;
    }).join('\n');
  }
  const close = '</final>';
  const bodyStart = state.openEnd, bodyEnd = state.end > state.openEnd ? state.end - close.length : state.openEnd;
  const body = text.slice(bodyStart, bodyEnd);
  const existing = /\s*<donedata\b[^>]*>[\s\S]*?<\/donedata\s*>/i.exec(body);
  let result = text;
  if (existing) {
    const start = bodyStart + existing.index;
    result = text.slice(0, start) + text.slice(start + existing[0].length);
  }
  if (mode === 'none') { return result; }
  const refreshed = findState(result, update.stateId)!;
  const lineStart = result.lastIndexOf('\n', refreshed.start) + 1;
  const indent = (result.slice(lineStart, refreshed.start).match(/^[ \t]*/)?.[0] ?? '') + '  ';
  const formatted = `<donedata>\n${indentFragment(inner, indent + '  ')}\n${indent}</donedata>`;
  if (/\/\s*>$/.test(refreshed.tag)) {
    const open = refreshed.tag.replace(/\/\s*>$/, '>');
    const parentIndent = indent.slice(0, -2);
    return result.slice(0, refreshed.start) + `${open}\n${indent}${formatted}\n${parentIndent}</final>` + result.slice(refreshed.openEnd);
  }
  const insert = refreshed.end - close.length;
  return result.slice(0, insert) + `\n${indent}${formatted}\n${indent.slice(0, -2)}` + result.slice(insert);
}


export interface DataDeclarationUpdate { id: string; mode: 'expr' | 'src' | 'content'; value: string; }
export interface DataModelUpdate { scopeId?: string; declarations: DataDeclarationUpdate[]; }

export function readDataModel(text: string, scopeId?: string): DataDeclarationUpdate[] {
  const region = getDataModelScope(text, scopeId);
  if (!region) { return []; }
  const block = /<datamodel\b[^>]*>([\s\S]*?)<\/datamodel\s*>/i.exec(region.body);
  if (!block) { return []; }
  return [...block[1].matchAll(/<data\b([^>]*?)(?:\/>|>([\s\S]*?)<\/data\s*>)/gi)].map(match => {
    const attrs = match[1];
    const id = readXmlAttribute(attrs, 'id') || '';
    const expr = readXmlAttribute(attrs, 'expr');
    const src = readXmlAttribute(attrs, 'src');
    return expr !== undefined ? { id, mode: 'expr' as const, value: expr }
      : src !== undefined ? { id, mode: 'src' as const, value: src }
      : { id, mode: 'content' as const, value: (match[2] || '').trim() };
  });
}

export function updateDataModel(text: string, update: DataModelUpdate): string {
  const declarations = update.declarations ?? [];
  const seen = new Set<string>();
  for (const item of declarations) {
    const id = String(item.id ?? '').trim();
    const value = String(item.value ?? '').trim();
    if (!id) { throw new Error('Every data declaration requires an ID.'); }
    if (seen.has(id)) { throw new Error(`Duplicate data ID in this scope: ${id}.`); }
    seen.add(id);
    if (!/^[A-Za-z_][\w.-]*$/.test(id)) { throw new Error(`Data ID ${id} is not a valid XML identifier.`); }
    if (!value) { throw new Error(`Data declaration ${id} requires an expression, source, or inline content.`); }
  }
  const scope = getDataModelScope(text, update.scopeId);
  if (!scope) { throw new Error(update.scopeId ? `State ${update.scopeId} was not found.` : 'The SCXML root element was not found.'); }
  const existing = /\s*<datamodel\b[^>]*>[\s\S]*?<\/datamodel\s*>/i.exec(scope.body);
  let result = text;
  if (existing) {
    const start = scope.bodyStart + existing.index;
    result = text.slice(0, start) + text.slice(start + existing[0].length);
  }
  if (!declarations.length) { return result; }
  const refreshed = getDataModelScope(result, update.scopeId)!;
  const lineStart = result.lastIndexOf('\n', refreshed.openStart) + 1;
  const parentIndent = result.slice(lineStart, refreshed.openStart).match(/^[ \t]*/)?.[0] ?? '';
  const indent = parentIndent + '  ';
  const items = declarations.map(item => {
    const id = escapeXml(item.id.trim()); const value = String(item.value).trim();
    if (item.mode === 'expr') { return `${indent}  <data id="${id}" expr="${escapeXml(value)}"/>`; }
    if (item.mode === 'src') { return `${indent}  <data id="${id}" src="${escapeXml(value)}"/>`; }
    return `${indent}  <data id="${id}">${value}</data>`;
  }).join('\n');
  const block = `${indent}<datamodel>\n${items}\n${indent}</datamodel>`;
  if (/\/\s*>$/.test(refreshed.openTag)) {
    const expanded = refreshed.openTag.replace(/\/\s*>$/, '>');
    return result.slice(0, refreshed.openStart) + `${expanded}\n${block}\n${parentIndent}</${refreshed.closeName}>` + result.slice(refreshed.openEnd);
  }
  return result.slice(0, refreshed.bodyStart) + `\n${block}` + result.slice(refreshed.bodyStart);
}

function readXmlAttribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attrs)?.[2];
}

function getDataModelScope(text: string, scopeId?: string): { openStart: number; openEnd: number; bodyStart: number; bodyEnd: number; body: string; openTag: string; closeName: string } | undefined {
  if (scopeId) {
    const state = findState(text, scopeId); if (!state) { return undefined; }
    const closeName = state.kind;
    const bodyEnd = state.end > state.openEnd ? state.end - (`</${closeName}>`).length : state.openEnd;
    return { openStart: state.start, openEnd: state.openEnd, bodyStart: state.openEnd, bodyEnd, body: text.slice(state.openEnd, bodyEnd), openTag: state.tag, closeName };
  }
  const root = /<scxml\b[^>]*>/i.exec(text); const closeStart = text.lastIndexOf('</scxml>');
  if (!root || closeStart < 0) { return undefined; }
  return { openStart: root.index, openEnd: root.index + root[0].length, bodyStart: root.index + root[0].length, bodyEnd: closeStart, body: text.slice(root.index + root[0].length, closeStart), openTag: root[0], closeName: 'scxml' };
}
