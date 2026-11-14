import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * Marks every plain HTML/SVG element in the app's .tsx files with where it is
 * written: data-src="Component@folder/file.tsx:line". The feedback picker reads
 * it, so a report says which file and line a tester pointed at. Only text is
 * inserted inside lines, so line numbers (and source maps by line) stay right.
 * Set PARTY_SOURCE_TAGS=off to build without them.
 */
export function tagSource(code: string, file: string): string {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const inserts: { at: number; text: string }[] = [];
  const componentOf = (node: ts.Node): string | null => {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
      if (ts.isFunctionDeclaration(at) && at.name && /^[A-Z]/.test(at.name.text)) return at.name.text;
      if (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name) && /^[A-Z]/.test(at.name.text)) return at.name.text;
    }
    return null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      // Components (Capitalised, a.b) pass props on; only real DOM elements reach the page.
      const plain = ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
      const tagged = node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'data-src');
      if (plain && !tagged) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const component = componentOf(node);
        inserts.push({ at: tag.end, text: ` data-src="${component ? `${component}@` : ''}${file}:${line}"` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  let result = code;
  for (const insert of inserts.sort((a, b) => b.at - a.at)) result = result.slice(0, insert.at) + insert.text + result.slice(insert.at);
  return result;
}

export function sourceTags(): Plugin {
  const enabled = process.env.PARTY_SOURCE_TAGS !== 'off';
  return {
    name: 'party-source-tags',
    enforce: 'pre',
    transform(code, id) {
      const match = /\/apps\/web\/src\/(.+\.tsx)$/.exec(id.split('?')[0]!);
      if (!enabled || !match) return null;
      return { code: tagSource(code, match[1]!), map: null };
    },
  };
}
