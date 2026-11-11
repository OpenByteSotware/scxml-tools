export interface StateUpdate { oldId: string; id: string; kind: string; initial: boolean; }
export interface TransitionUpdate { stateId: string; index: number; event: string; cond: string; targets: string; }

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
  if (update.kind && update.kind !== found.kind) { openTag = openTag.replace(new RegExp(`^<${found.kind}\\b`, 'i'), `<${update.kind}`); }
  let result = text.slice(0, found.start) + openTag + text.slice(found.openEnd);
  if (update.kind && update.kind !== found.kind && found.end > found.openEnd) {
    const delta = openTag.length - found.tag.length; const closeStart = result.lastIndexOf(`</${found.kind}>`, found.end + delta);
    if (closeStart >= 0) { result = result.slice(0, closeStart) + `</${update.kind}>` + result.slice(closeStart + found.kind.length + 3); }
  }
  if (update.oldId !== update.id) {
    result = result.replace(/\b(initial|target)\s*=\s*(["'])(.*?)\2/gi, (whole, name, quote, value) => {
      const values = String(value).split(/\s+/).map(v => v === update.oldId ? update.id : v);
      return `${name}=${quote}${values.join(' ')}${quote}`;
    });
  }
  const root = /<scxml\b[^>]*>/i.exec(result);
  if (root) {
    const changed = update.initial ? setAttribute(root[0], 'initial', update.id) : root[0].replace(new RegExp(`(\\sinitial\\s*=\\s*)(["'])${escapeRegExp(update.id)}\\2`, 'i'), '');
    result = result.slice(0, root.index) + changed + result.slice(root.index + root[0].length);
  }
  return result;
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
    const start = found.openEnd + match.index;
    return text.slice(0, start) + tag + text.slice(start + match[0].length);
  }
  throw new Error(`Transition ${update.index + 1} was not found in state ${update.stateId}.`);
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export interface NewState { id: string; kind: string; initial: boolean; }
export interface NewTransition { stateId: string; event: string; cond: string; targets: string; }

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
