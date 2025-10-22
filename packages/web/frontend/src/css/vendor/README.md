# Vendor CSS snapshots

These files mirror the third-party stylesheets that ship with the original Asynkron LiveView web frontend:
https://github.com/asynkron/Asynkron.LiveView

The copies live in-repo so `npm run build --prefix packages/web` succeeds even when the corresponding npm modules have not been installed locally. Update them whenever we bump the upstream package versions.

| Package | Source file | Local path |
| ------- | ----------- | ---------- |
| highlight.js@11.9.0 | `styles/github-dark.css` | `highlight/github-dark.css` |
| codemirror@5.65.20 | `lib/codemirror.css` | `codemirror/codemirror.css` |
| codemirror-one-dark-theme@1.1.1 | `one-dark.css` | `codemirror-one-dark/one-dark.css` |
| dockview@4.9.0 | `dist/styles/dockview.css` | `dockview/dockview.css` |
| @fortawesome/fontawesome-free@7.1.0 | `css/all.min.css` + `webfonts/*.woff2` | `fontawesome/css/all.min.css`, `fontawesome/webfonts/` |

To refresh a file, reinstall dependencies at the repo root and copy the upstream asset over the existing snapshot (preserving the brief header comment with the version number).
