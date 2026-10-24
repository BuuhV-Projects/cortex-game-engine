// Babel plugin (ADR-0465): `super.x` READS keep the receiver.
//
// The export runs `@babel/plugin-transform-classes` in loose mode (the Hermes has
// no `class`, and spec mode's `Reflect.construct` breaks on it). Loose turns
// `super.x` into `Base.prototype.x` with NO receiver: method calls are fine
// (`.call(this)`), but a GETTER runs with the prototype as `this` — it broke the
// three's `DynamicLightsNode` silently. This plugin runs first, with the classes
// still intact, and rewrites only the reads into the spec semantics:
// `Reflect.get(Object.getPrototypeOf(Home), key, this)`.
export default function superReceiver({ types: t }) {
  /** The class whose method/property encloses `path`, and whether it is static. */
  function home(path) {
    const member = path.findParent(
      (p) => p.isClassMethod() || p.isClassPrivateMethod() || p.isClassProperty() || p.isClassPrivateProperty(),
    );
    if (!member) return null;
    const cls = member.parentPath.parentPath;
    if (!cls.isClass()) return null;
    if (!cls.node.id) cls.node.id = cls.scope.generateUidIdentifier('Class');
    const id = t.identifier(cls.node.id.name);
    return member.node.static ? id : t.memberExpression(id, t.identifier('prototype'));
  }

  function rewrite(path) {
    const { parent, node } = path;
    if (!t.isSuper(node.object)) return;
    // Calls keep the loose form (receiver passed by `.call(this)`).
    if ((t.isCallExpression(parent) || t.isOptionalCallExpression(parent)) && parent.callee === node) return;
    if ((t.isAssignmentExpression(parent) && parent.left === node) || t.isUpdateExpression(parent) ||
        (t.isUnaryExpression(parent) && parent.operator === 'delete')) {
      throw path.buildCodeFrameError('super property write: not supported by the Hermes export (ADR-0465)');
    }
    const target = home(path);
    if (!target) return; // object-literal `super`: left to the default transform
    const key = node.computed ? node.property : t.stringLiteral(node.property.name);
    path.replaceWith(
      t.callExpression(t.memberExpression(t.identifier('Reflect'), t.identifier('get')), [
        t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('getPrototypeOf')), [target]),
        key,
        t.thisExpression(),
      ]),
    );
  }

  return {
    name: 'cortex-super-receiver',
    visitor: {
      // Whole program at entry: before transform-classes touches any class.
      Program(path) {
        path.traverse({ MemberExpression: rewrite });
      },
    },
  };
}
