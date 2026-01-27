## Code Style
- All code comments must be in English
- Use 4-space indentation
- After implementing large features, run `npm run lint` to check for issues
  - Pay attention to max file length and max function length limits
  - Refactor if lint errors occur due to these limits

## Git Commits
- Use conventional commit format (feat, fix, chore, docs, refactor, etc.)
- Write commit messages in English
- Keep messages concise (under 72 characters for subject line)
- Examples:
  - `feat: add gallery view with grid layout`
  - `fix: iOS WebView file access using convertFileSrc`
  - `chore: update dependencies`

## Documentation
- **Project-specific docs (`docs/`)**: Architecture, implementation details, and knowledge specific to this project
- **Reusable knowledge (`ai-workspace/knowledge/`)**: Platform-specific issues or non-obvious solutions that can be applied to other projects

### Examples
| Type | Location | Example |
|------|----------|---------|
| Project architecture | `docs/` | Component structure, state management design |
| Implementation details | `docs/` | API integration specifics, data flow |
| Reusable solutions | `ai-workspace/knowledge/` | iOS WebView file access workaround |

### Existing Knowledge (`ai-workspace/knowledge/`)
- `capacitor/` - Capacitor iOS WebView issues (file access, audio/video sync, share extension)
- `electron/` - Electron-specific solutions
- `ios/` - Native iOS development issues
- `obsidian/` - Obsidian plugin development
- `webdriverio/` - WebdriverIO testing solutions
