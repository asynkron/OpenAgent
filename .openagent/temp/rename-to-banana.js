export default function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  root
    .find(j.ClassDeclaration, { id: { name: 'BrowseCommand' } })
    .forEach((path) => {
      path.node.id.name = 'BananaCommand';
    });

  root
    .find(j.Identifier, { name: 'BrowseCommand' })
    .forEach((path) => {
      const parent = path.parentPath ? path.parentPath.value : null;
      if (parent) {
        if (parent.type === 'ClassDeclaration' && parent.id === path.node) {
          return;
        }
        if (parent.type === 'MemberExpression' && parent.property === path.node && !parent.computed) {
          return;
        }
        if (parent.type === 'Property' && parent.key === path.node && !parent.computed) {
          return;
        }
      }
      path.node.name = 'BananaCommand';
    });

  return root.toSource();
}
