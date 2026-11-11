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
