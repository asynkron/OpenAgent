# Working with JavaScript

## Always check syntax

Whenever you make a change to a JavaScript file, ensure the file is still valid syntax:
`node --check myfile.js`
If not, iterate and continue to work on the file.

or for all files: `find src -name "*.js" -print0 | xargs -0 -n1 node --check`

## Always check dependencies, and install if needed

Assuming this is a Node.js project with a package.json file, always check that all dependencies are installed and at the correct version.

When you run

```bash
npm ls <package-name>
```

and the dependency is not installed, npm will output something like this:

```bash
project-name@1.0.0 /path/to/project
└── UNMET DEPENDENCY <package-name>@<expected-version>
```

UNMET DEPENDENCY means it’s listed in package.json but not found in node_modules.

If you just run npm ls without arguments, the whole tree is printed and missing ones show up with the UNMET DEPENDENCY label.

The command also exits with a non-zero exit code if there are unmet dependencies, which makes it script-friendly.

## Qucik overview of AST

```bash
npm install acorn --save-dev
```

## Finding all functions in a JavaScript file

```bash
npx acorn index.js --ecma2020 --locations \
| jq '.. | objects | select(.type?=="FunctionDeclaration") | {name: .id.name, line: .loc.start.line}'
```
