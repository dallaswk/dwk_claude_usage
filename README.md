# Claude Usage

Muestra en la barra de estado de VS Code el uso del plan de Claude: `5h 8% · 7d 19%`.
Al pasar el ratón salen todos los límites con su barra y cuándo se reinician. Clic = actualizar.

Usa el token OAuth que guarda Claude Code en `~/.claude/.credentials.json` (no lo renueva: eso lo hace Claude Code).

## Instalar

```
npx @vscode/vsce package --allow-missing-repository
code --install-extension dwk-claude-usage-0.1.3.vsix
```
