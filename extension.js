const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_USO = 'https://api.anthropic.com/api/oauth/usage';

let item;
let timer;
let ultimo = null;
let log;

function config() {
    return vscode.workspace.getConfiguration('claudeUsage');
}

// Lee el token que mantiene Claude Code. No lo refrescamos nosotros: si rotásemos
// el refresh token, Claude Code se quedaría con uno inválido.
function leerToken() {
    const ruta = config().get('credencialesPath') || path.join(os.homedir(), '.claude', '.credentials.json');
    const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    const oauth = datos.claudeAiOauth;
    if (!oauth || !oauth.accessToken) throw new Error('No hay sesión de Claude en ' + ruta);
    return oauth;
}

function tiempoHasta(iso) {
    if (!iso) return '';
    let min = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
    const d = Math.floor(min / 1440); min -= d * 1440;
    const h = Math.floor(min / 60); min -= h * 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${min}m`;
    return `${min}m`;
}

function barra(pct) {
    const llenos = Math.round(Math.min(100, pct) / 10);
    return '█'.repeat(llenos) + '░'.repeat(10 - llenos);
}

function nombreLimite(l) {
    if (l.kind === 'session') return 'Sesión (5 h)';
    if (l.kind === 'weekly_all') return 'Semanal';
    const modelo = l.scope && l.scope.model && l.scope.model.display_name;
    return modelo ? `Semanal ${modelo}` : l.kind;
}

// Normaliza la respuesta: usa `limits` si viene, si no los campos clásicos.
function limites(json) {
    if (Array.isArray(json.limits) && json.limits.length) {
        return json.limits.map(l => ({ nombre: nombreLimite(l), kind: l.kind, pct: l.percent ?? 0, reset: l.resets_at }));
    }
    const out = [];
    if (json.five_hour) out.push({ nombre: 'Sesión (5 h)', kind: 'session', pct: json.five_hour.utilization ?? 0, reset: json.five_hour.resets_at });
    if (json.seven_day) out.push({ nombre: 'Semanal', kind: 'weekly_all', pct: json.seven_day.utilization ?? 0, reset: json.seven_day.resets_at });
    return out;
}

function pintar() {
    if (!ultimo) return;
    if (ultimo.error) {
        item.text = '$(warning) Claude';
        item.tooltip = 'Claude Usage: ' + ultimo.error + '\n\nClic para reintentar';
        item.backgroundColor = undefined;
        return;
    }

    const ls = ultimo.limites;
    const sesion = ls.find(l => l.kind === 'session');
    const semana = ls.find(l => l.kind === 'weekly_all');
    const partes = [];
    if (sesion) partes.push(`5h ${Math.round(sesion.pct)}%`);
    if (semana) partes.push(`7d ${Math.round(semana.pct)}%`);
    item.text = '$(pulse) ' + (partes.join(' · ') || 'Claude');

    const aviso = config().get('avisoPorcentaje');
    const maximo = Math.max(0, ...ls.map(l => l.pct));
    item.backgroundColor = maximo >= 100
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : maximo >= aviso ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown('**Uso de Claude**\n\n');
    for (const l of ls) {
        md.appendMarkdown(`${l.nombre}: **${Math.round(l.pct)}%**  \n`);
        md.appendMarkdown(`\`${barra(l.pct)}\` se reinicia en ${tiempoHasta(l.reset)}\n\n`);
    }
    md.appendMarkdown(`---\n\nActualizado ${ultimo.hora.toLocaleTimeString()} · clic para actualizar`);
    item.tooltip = md;
}

async function actualizar() {
    item.text = '$(sync~spin) Claude';
    try {
        const oauth = leerToken();
        const r = await fetch(URL_USO, {
            headers: {
                Authorization: 'Bearer ' + oauth.accessToken,
                'anthropic-beta': 'oauth-2025-04-20',
            },
        });
        if (r.status === 401) throw new Error('Token caducado; se renovará cuando uses Claude Code');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        ultimo = { limites: limites(await r.json()), hora: new Date() };
        log.appendLine(`${new Date().toLocaleTimeString()} OK ${ultimo.limites.map(l => l.nombre + ' ' + l.pct + '%').join(', ')}`);
    } catch (e) {
        ultimo = { error: e.message || String(e) };
        log.appendLine(`${new Date().toLocaleTimeString()} ERROR ${ultimo.error}`);
    }
    pintar();
}

function programar() {
    clearInterval(timer);
    const min = Math.max(1, config().get('intervaloMinutos'));
    timer = setInterval(actualizar, min * 60000);
}

function activate(context) {
    log = vscode.window.createOutputChannel('Claude Usage');
    log.appendLine('Activada');
    item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.command = 'claudeUsage.refresh';
    item.name = 'Claude Usage';
    item.text = '$(sync~spin) Claude';
    item.show();

    context.subscriptions.push(
        item,
        log,
        vscode.commands.registerCommand('claudeUsage.refresh', actualizar),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeUsage')) { programar(); pintar(); }
        }),
        { dispose: () => clearInterval(timer) },
    );

    actualizar();
    programar();
}

function deactivate() {}

module.exports = { activate, deactivate };
