export interface XmlSourceAttribute {
  name: string;
  value: string;
  quote: '"' | "'";
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
}

export interface XmlSourceElement {
  name: string;
  localName: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  parent?: XmlSourceElement;
  children: XmlSourceElement[];
  attributes: XmlSourceAttribute[];
}

export interface XmlSourceDocument {
  text: string;
  roots: XmlSourceElement[];
  elements: XmlSourceElement[];
}

function findTagEnd(text: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === quote) { quote = ''; } continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') { return index + 1; }
  }
  return text.length;
}

function readAttributes(text: string, start: number, end: number): XmlSourceAttribute[] {
  const source = text.slice(start, end);
  const result: XmlSourceAttribute[] = [];
  const nameEnd = /^<\s*[^\s/>]+/.exec(source)?.[0].length ?? 1;
  const pattern = /\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  pattern.lastIndex = nameEnd;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const absolute = start + match.index;
    const valueOffset = match[0].indexOf(match[3], match[0].indexOf(match[2]) + 1);
    result.push({ name: match[1], value: match[3], quote: match[2] as '"' | "'", start: absolute, end: absolute + match[0].length, valueStart: absolute + valueOffset, valueEnd: absolute + valueOffset + match[3].length });
  }
  return result;
}

export function parseXmlSource(text: string): XmlSourceDocument {
  const roots: XmlSourceElement[] = [], elements: XmlSourceElement[] = [], stack: XmlSourceElement[] = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('<', index);
    if (start < 0) { break; }
    if (text.startsWith('<!--', start)) { const end = text.indexOf('-->', start + 4); index = end < 0 ? text.length : end + 3; continue; }
    if (text.startsWith('<![CDATA[', start)) { const end = text.indexOf(']]>', start + 9); index = end < 0 ? text.length : end + 3; continue; }
    if (text.startsWith('<?', start)) { const end = text.indexOf('?>', start + 2); index = end < 0 ? text.length : end + 2; continue; }
    if (text.startsWith('<!', start)) { index = findTagEnd(text, start); continue; }
    const openEnd = findTagEnd(text, start);
    const token = text.slice(start, openEnd);
    const closing = /^<\s*\//.test(token);
    const name = /^<\s*\/?\s*([^\s/>]+)/.exec(token)?.[1];
    if (!name) { index = openEnd; continue; }
    if (closing) {
      for (let cursor = stack.length - 1; cursor >= 0; cursor--) {
        if (stack[cursor].name !== name) { continue; }
        const element = stack[cursor];
        element.closeStart = start; element.end = openEnd;
        stack.length = cursor;
        break;
      }
      index = openEnd; continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const parent = stack[stack.length - 1];
    const element: XmlSourceElement = { name, localName: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name, start, openEnd, closeStart: openEnd, end: openEnd, selfClosing, parent, children: [], attributes: readAttributes(text, start, openEnd) };
    elements.push(element); parent ? parent.children.push(element) : roots.push(element);
    if (!selfClosing) { stack.push(element); }
    index = openEnd;
  }
  for (const element of stack) { element.closeStart = element.end = text.length; }
  return { text, roots, elements };
}

export function getAttribute(element: XmlSourceElement, name: string): XmlSourceAttribute | undefined {
  return element.attributes.find(attribute => attribute.name === name);
}

export function findElementById(document: XmlSourceDocument, localNames: Set<string>, id: string): XmlSourceElement | undefined {
  return document.elements.find(element => localNames.has(element.localName) && getAttribute(element, 'id')?.value === id);
}

export function directChildren(element: XmlSourceElement, localName?: string): XmlSourceElement[] {
  return localName ? element.children.filter(child => child.localName === localName) : [...element.children];
}

export function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

export function setSourceAttribute(text: string, element: XmlSourceElement, name: string, value: string): string {
  const existing = getAttribute(element, name);
  if (!value) {
    if (!existing) { return text; }
    return replaceRange(text, existing.start, existing.end, '');
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  if (existing) { return replaceRange(text, existing.valueStart, existing.valueEnd, escaped); }
  const insert = element.openEnd - (element.selfClosing ? text.slice(element.start, element.openEnd).match(/\/\s*>$/)?.[0].length ?? 2 : 1);
  return replaceRange(text, insert, insert, ` ${name}="${escaped}"`);
}
