import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// SPEC-0357: on the native host (Hermes, no JIT) every temporary built per
// frame feeds the garbage collector. A system's `update()` runs every frame,
// so the three.js math types it needs live in module/instance scratch fields.
const BANNED = new Set(['Vector2', 'Vector3', 'Vector4', 'Matrix3', 'Matrix4', 'Quaternion', 'Euler', 'Box3', 'Sphere', 'Ray', 'Plane', 'Color']);
const SRC = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const extendsSystem = (node: ts.ClassDeclaration): boolean =>
  node.heritageClauses?.some((h) => h.token === ts.SyntaxKind.ExtendsKeyword && h.types.some((t) => t.expression.getText() === 'System')) ?? false;

/** Name of the constructed type when it is a banned three.js math type (`Vector3` or `THREE.Vector3`). */
function bannedName(node: ts.NewExpression): string | null {
  const e = node.expression;
  const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;
  return name !== null && BANNED.has(name) ? name : null;
}

/** `file:line Type` for every banned `new` inside a System's `update()` under `root`. */
function findUpdateAllocations(files: readonly string[], root: string): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('extends System')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const scan = (node: ts.Node): void => {
      if (ts.isNewExpression(node)) {
        const name = bannedName(node);
        if (name) found.push(`${relative(root, file).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${name}`);
      }
      ts.forEachChild(node, scan);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && extendsSystem(node)) {
        for (const m of node.members) {
          if (ts.isMethodDeclaration(m) && m.name.getText() === 'update' && m.body) scan(m.body);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

describe('SPEC-0357 — no three.js math allocation inside System.update()', () => {
  it('the check catches a known allocation (instrument validation)', () => {
    const dir = join(__dirname, '__fixtures__');
    expect(findUpdateAllocations([join(dir, 'allocatingSystem.fixture.txt')], dir)).toEqual([
      'allocatingSystem.fixture.txt:6 Vector3',
      'allocatingSystem.fixture.txt:7 Matrix4',
    ]);
  });

  it('engine systems allocate no Vector3/Matrix4/Box3/… per frame', () => {
    expect(findUpdateAllocations(sourceFiles(SRC), SRC)).toEqual([]);
  });
});
