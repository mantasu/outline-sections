# Outline Sections

[![Test](https://github.com/mantasu/outline-sections/actions/workflows/test.yaml/badge.svg)](https://github.com/mantasu/outline-sections/actions/workflows/test.yaml)
[![Coverage](https://codecov.io/gh/mantasu/outline-sections/graph/badge.svg)](https://codecov.io/gh/mantasu/outline-sections)

A minimal VS Code extension that injects `#region` / `#endregion` blocks into the built-in **Outline** view as a collapsible tree.

## Supported syntax

| Languages | Region comment style |
|---|---|
| Python, Ruby, Shell, PowerShell, R, YAML… | `# region Name` / `# endregion` |
| JS, TS, C, C++, C#, Java, Go, Rust, Dart… | `// #region Name` / `// #endregion` |
| HTML, XML, Markdown | `<!-- #region Name -->` / `<!-- #endregion -->` |

Both `#region` and `# region` (with a space) are accepted.

## Development

Install the latest version of [Node.js LTS](https://nodejs.org) and the dependent packages (note all packages install locally into `node_modules/` so no virtual environment is needed):
```bash
make setup
```

> **Windows:** install Node.js LTS from [nodejs.org](https://nodejs.org) manually, then use `make install` (requires [Git Bash](https://gitforwindows.org) or [WSL](https://learn.microsoft.com/en-us/windows/wsl/install)).


```bash
npm run test                          # run tests + generate coverage report
npm run package                       # compile → out/ and build .vsix (what gets published)
npx semantic-release --dry-run        # preview next release version and notes
```

> [!TIP]
> You can run `make clean` to clean up compiled/generated files.

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.