'use strict';

/* =====================================================
   DOM
===================================================== */
const exprEl = document.getElementById('exprText');
const resultEl = document.getElementById('resultText');
const histPanel = document.getElementById('historyPanel');
const histList = document.getElementById('historyList');
const histBtn = document.getElementById('histBtn');
const clearHist = document.getElementById('clearHist');
const themeToggle = document.getElementById('themeToggle');
const sciToggle = document.getElementById('sciToggle');
const sciPanel = document.getElementById('sciPanel');
const degBtn = document.getElementById('degBtn');
const invBtn = document.getElementById('invBtn');

/* =====================================================
   ESTADO
===================================================== */
let expr = '';
let answered = false;
let history = [];

// Modo científico
let sciOpen = false;     // panel visible
let useRad = false;     // false = grados (Deg), true = radianes (Rad)
let invMode = false;     // funciones inversas activas

/* =====================================================
   EVALUADOR
===================================================== */
function safeEval(str) {
    const js = str
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-');
    if (!/^[0-9+\-*/.() e]+$/.test(js)) return null;
    try {
        const val = Function('"use strict"; return (' + js + ')')();
        if (!isFinite(val)) return 'Error';
        return val;
    } catch { return null; }
}

function formatNum(n) {
    if (n === null || n === undefined) return null;
    if (n === 'Error') return 'Error';
    const v = parseFloat(n);
    if (isNaN(v)) return null;
    let s = parseFloat(v.toPrecision(10)).toString();
    if (s.replace('-', '').replace('.', '').length > 12)
        s = parseFloat(v.toPrecision(7)).toExponential();
    return s;
}

/* =====================================================
   RENDER
===================================================== */
function render(liveResult) {
    const display = expr === '' ? '0' : expr;
    exprEl.textContent = display;
    const len = display.length;
    exprEl.classList.remove('long', 'medium');
    if (len > 16) exprEl.classList.add('long');
    else if (len > 10) exprEl.classList.add('medium');

    if (answered) {
        // nada extra
    } else if (liveResult !== null && liveResult !== undefined && expr !== '' && liveResult !== 'Error') {
        resultEl.textContent = '= ' + formatNum(liveResult);
        resultEl.className = 'result-text';
    } else {
        resultEl.textContent = '';
        resultEl.className = 'result-text';
    }
}

/* =====================================================
   HELPERS
===================================================== */
function lastChar() { return expr[expr.length - 1] ?? ''; }
function isOp(c) { return ['+', '−', '×', '÷'].includes(c); }
function parenBalance() {
    let o = 0;
    for (const c of expr) { if (c === '(') o++; else if (c === ')') o--; }
    return o;
}
function canClose() { return parenBalance() > 0 && !isOp(lastChar()) && lastChar() !== '('; }

/* =====================================================
   ACCIONES ESTÁNDAR
===================================================== */
function pressDigit(d) {
    if (answered) { expr = d === '0' ? '0' : d; answered = false; }
    else { if (expr === '0') expr = d; else expr += d; }
    render(safeEval(expr));
}

function pressDecimal() {
    if (answered) { expr = '0.'; answered = false; render(null); return; }
    const parts = expr.split(/[+\−×÷()]/);
    const last = parts[parts.length - 1];
    if (!last.includes('.')) {
        if (expr === '' || isOp(lastChar()) || lastChar() === '(') expr += '0';
        expr += '.';
    }
    render(safeEval(expr));
}

function pressOperator(op) {
    if (expr === '' && op !== '−') return;
    if (answered) { answered = false; expr += op; render(null); return; }
    const lc = lastChar();
    if (isOp(lc)) expr = expr.slice(0, -1) + op;
    else if (lc === '(') { if (op === '−') expr += op; }
    else if (expr === '') { if (op === '−') expr = '−'; }
    else expr += op;
    render(null);
    highlightOp(op);
}

function pressParen() {
    if (answered) { expr = '('; answered = false; render(null); return; }
    const lc = lastChar();
    if (canClose()) {
        expr += ')';
    } else {
        if (lc !== '' && !isOp(lc) && lc !== '(' && lc !== '.') expr += '×(';
        else expr += '(';
    }
    render(safeEval(expr));
}

function pressPercent() {
    if (expr === '') return;
    const val = safeEval(expr);
    if (val !== null && val !== 'Error') {
        expr = formatNum(val / 100) ?? expr;
        render(safeEval(expr));
    }
}

function pressEquals() {
    if (expr === '') return;
    while (parenBalance() > 0) expr += ')';
    const val = safeEval(expr);
    const res = formatNum(val);
    const full = expr;
    if (res === null || res === 'Error') {
        resultEl.textContent = 'Error'; resultEl.className = 'result-text error';
        exprEl.textContent = expr; return;
    }
    exprEl.textContent = full + ' =';
    exprEl.classList.remove('long', 'medium');
    const len = exprEl.textContent.length;
    if (len > 16) exprEl.classList.add('long');
    else if (len > 10) exprEl.classList.add('medium');
    resultEl.textContent = res;
    resultEl.className = 'result-text answer';
    addHistory(full, res);
    expr = res; answered = true;
    removeActiveOp();
}

function pressClear() {
    expr = ''; answered = false;
    exprEl.textContent = '0'; exprEl.classList.remove('long', 'medium');
    resultEl.textContent = ''; resultEl.className = 'result-text';
    removeActiveOp();
}

function pressDelete() {
    if (answered) { pressClear(); return; }
    if (!expr.length) return;
    expr = expr.slice(0, -1);
    render(expr === '' ? null : safeEval(expr));
}

/* =====================================================
   ACCIONES CIENTÍFICAS
===================================================== */

// Convierte entrada según modo grados/radianes
function toRad(x) { return useRad ? x : x * (Math.PI / 180); }
function fromRad(x) { return useRad ? x : x * (180 / Math.PI); }

// Obtiene el número actual para aplicar función unaria
function getCurrentNum() {
    if (expr === '') return null;
    // Si ended en operador o paréntesis abierto, no hay num al final
    if (isOp(lastChar()) || lastChar() === '(') return null;
    // Extraer último token numérico
    const match = expr.match(/([\-]?[\d.]+(?:e[+\-]?\d+)?)$/);
    return match ? parseFloat(match[1]) : null;
}

function replaceLastNum(newVal) {
    const formatted = formatNum(newVal);
    if (formatted === null || formatted === 'Error') {
        showError(); return;
    }
    // Reemplazar último token
    const match = expr.match(/([\-]?[\d.]+(?:e[+\-]?\d+)?)$/);
    if (match) {
        expr = expr.slice(0, expr.length - match[0].length) + formatted;
    } else {
        expr = formatted;
    }
    render(safeEval(expr));
}

function showError() {
    resultEl.textContent = 'Error'; resultEl.className = 'result-text error';
}

function pressSci(action) {
    // Acciones que insertan texto directamente en la expresión
    switch (action) {

        case 'pi': {
            const pi = formatNum(Math.PI);
            if (answered) { expr = pi; answered = false; }
            else {
                const lc = lastChar();
                if (lc !== '' && !isOp(lc) && lc !== '(' && lc !== '') expr += '×' + pi;
                else expr += pi;
            }
            render(safeEval(expr));
            break;
        }

        case 'euler': {
            const e = formatNum(Math.E);
            if (answered) { expr = e; answered = false; }
            else {
                const lc = lastChar();
                if (lc !== '' && !isOp(lc) && lc !== '(') expr += '×' + e;
                else expr += e;
            }
            render(safeEval(expr));
            break;
        }

        case 'pow': {
            // Inserta ^ como operador — implementado expandiendo a **
            pressOperator('×');   // fallback visual; se maneja abajo en safeEval override
            // En realidad usamos ^ como marcador y lo procesamos al evaluar
            if (answered) { answered = false; }
            const lc = lastChar();
            if (isOp(lc)) expr = expr.slice(0, -1) + '^';
            else expr += '^';
            render(null);
            break;
        }

        case 'fact': {
            const n = getCurrentNum();
            if (n === null || !Number.isInteger(n) || n < 0 || n > 170) { showError(); return; }
            let f = 1n;
            for (let i = 2n; i <= BigInt(n); i++) f *= i;
            const res = Number(f);
            replaceLastNum(res);
            addHistory(`${n}!`, formatNum(res));
            break;
        }

        case 'sqrt': {
            if (invMode) {
                // inverso de sqrt = x²
                const x = getCurrentNum();
                if (x === null) return;
                replaceLastNum(x * x);
            } else {
                const x = getCurrentNum();
                if (x === null) return;
                if (x < 0) { showError(); return; }
                replaceLastNum(Math.sqrt(x));
            }
            break;
        }

        case 'sin': {
            const x = getCurrentNum(); if (x === null) return;
            if (invMode) {
                const r = Math.asin(x);
                if (isNaN(r)) { showError(); return; }
                replaceLastNum(fromRad(r));
            } else {
                replaceLastNum(Math.sin(toRad(x)));
            }
            break;
        }

        case 'cos': {
            const x = getCurrentNum(); if (x === null) return;
            if (invMode) {
                const r = Math.acos(x);
                if (isNaN(r)) { showError(); return; }
                replaceLastNum(fromRad(r));
            } else {
                replaceLastNum(Math.cos(toRad(x)));
            }
            break;
        }

        case 'tan': {
            const x = getCurrentNum(); if (x === null) return;
            if (invMode) {
                replaceLastNum(fromRad(Math.atan(x)));
            } else {
                const rad = toRad(x);
                // tan(90°) → undefined
                if (!useRad && Math.abs(x % 180) === 90) { showError(); return; }
                replaceLastNum(Math.tan(rad));
            }
            break;
        }

        case 'ln': {
            const x = getCurrentNum(); if (x === null) return;
            if (invMode) {
                replaceLastNum(Math.exp(x));
            } else {
                if (x <= 0) { showError(); return; }
                replaceLastNum(Math.log(x));
            }
            break;
        }

        case 'log': {
            const x = getCurrentNum(); if (x === null) return;
            if (invMode) {
                replaceLastNum(Math.pow(10, x));
            } else {
                if (x <= 0) { showError(); return; }
                replaceLastNum(Math.log10(x));
            }
            break;
        }
    }
}

/* Sobreescribir safeEval para soportar ^ */
const _origSafeEval = safeEval;
function safeEvalFull(str) {
    // Reemplazar ^ por **
    const expanded = str.replace(/\^/g, '**');
    const js = expanded
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-');
    if (!/^[0-9+\-*/.() e*]+$/.test(js)) return null;
    try {
        const val = Function('"use strict"; return (' + js + ')')();
        if (!isFinite(val)) return 'Error';
        return val;
    } catch { return null; }
}
// Reemplazar la función de render para usar la nueva versión
function renderFull(liveResult) {
    const display = expr === '' ? '0' : expr;
    exprEl.textContent = display;
    const len = display.length;
    exprEl.classList.remove('long', 'medium');
    if (len > 16) exprEl.classList.add('long');
    else if (len > 10) exprEl.classList.add('medium');
    if (!answered) {
        if (liveResult !== null && liveResult !== undefined && expr !== '' && liveResult !== 'Error') {
            resultEl.textContent = '= ' + formatNum(liveResult);
            resultEl.className = 'result-text';
        } else {
            resultEl.textContent = '';
            resultEl.className = 'result-text';
        }
    }
}

/* =====================================================
   DEG / INV TOGGLE
===================================================== */
function toggleDeg() {
    useRad = !useRad;
    degBtn.textContent = useRad ? 'Rad' : 'Deg';
    degBtn.classList.toggle('sci-active', useRad);
}

function toggleInv() {
    invMode = !invMode;
    invBtn.classList.toggle('sci-active', invMode);
    // Cambiar labels de funciones afectadas
    const labels = {
        sin: invMode ? 'sin⁻¹' : 'sin',
        cos: invMode ? 'cos⁻¹' : 'cos',
        tan: invMode ? 'tan⁻¹' : 'tan',
        ln: invMode ? 'eˣ' : 'ln',
        log: invMode ? '10ˣ' : 'log',
        sqrt: invMode ? 'x²' : '√',
    };
    document.querySelectorAll('.btn-sci[data-sci]').forEach(b => {
        const key = b.dataset.sci;
        if (labels[key]) b.textContent = labels[key];
    });
}

/* =====================================================
   CIENTÍFICA PANEL TOGGLE
===================================================== */
function toggleSci() {
    sciOpen = !sciOpen;
    sciPanel.classList.toggle('open', sciOpen);
    sciToggle.classList.toggle('closed', !sciOpen);
    // Reducir tamaño de botones via CSS variable cuando está abierto
    document.querySelector('.calc-shell').classList.toggle('sci-open', sciOpen);
}

// Iniciar cerrado (chevron apuntando abajo = clase closed)
sciToggle.classList.add('closed');

/* =====================================================
   HISTORIAL
===================================================== */
function addHistory(e, r) {
    history.unshift({ expr: e, result: r });
    if (history.length > 30) history.pop();
    renderHistory();
}
function renderHistory() {
    histList.innerHTML = '';
    if (!history.length) { histList.innerHTML = '<li class="hist-empty">Sin operaciones aún</li>'; return; }
    history.forEach(item => {
        const li = document.createElement('li');
        li.className = 'hist-item';
        li.innerHTML = `<span>${item.expr}</span><span class="h-res">= ${item.result}</span>`;
        li.addEventListener('click', () => {
            expr = item.result; answered = true;
            exprEl.textContent = item.expr + ' =';
            resultEl.textContent = item.result;
            resultEl.className = 'result-text answer';
        });
        histList.appendChild(li);
    });
}

/* =====================================================
   OP HIGHLIGHT
===================================================== */
function highlightOp(op) {
    removeActiveOp();
    document.querySelectorAll('.btn-op').forEach(b => {
        if (b.dataset.val === op) b.classList.add('active-op');
    });
}
function removeActiveOp() {
    document.querySelectorAll('.btn-op').forEach(b => b.classList.remove('active-op'));
}

/* =====================================================
   RIPPLE
===================================================== */
function ripple(btn) {
    btn.classList.remove('ripple');
    void btn.offsetWidth;
    btn.classList.add('ripple');
    setTimeout(() => btn.classList.remove('ripple'), 420);
}

/* =====================================================
   EVENTOS BOTONES ESTÁNDAR
===================================================== */
// Parchamos pressEquals y pressDigit etc. para usar safeEvalFull
const _pressEquals = pressEquals;

document.querySelectorAll('.btn[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
        ripple(btn);
        const v = btn.dataset.val;
        if ('0123456789'.includes(v)) pressDigit(v);
        else if (v === '.') pressDecimal();
        else if (['+', '−', '×', '÷'].includes(v)) pressOperator(v);
        else if (v === '(') pressParen();
        else if (v === '%') pressPercent();
        else if (v === '=') pressEqualsExt();
        else if (v === 'AC') pressClear();
        else if (v === 'DEL') pressDelete();
    });
});

// Versión extendida de pressEquals que soporta ^
function pressEqualsExt() {
    if (expr === '') return;
    while (parenBalance() > 0) expr += ')';
    const val = safeEvalFull(expr);
    const res = formatNum(val);
    const full = expr;
    if (res === null || res === 'Error') {
        resultEl.textContent = 'Error'; resultEl.className = 'result-text error';
        exprEl.textContent = expr; return;
    }
    exprEl.textContent = full + ' =';
    exprEl.classList.remove('long', 'medium');
    const len = exprEl.textContent.length;
    if (len > 16) exprEl.classList.add('long');
    else if (len > 10) exprEl.classList.add('medium');
    resultEl.textContent = res; resultEl.className = 'result-text answer';
    addHistory(full, res);
    expr = res; answered = true;
    removeActiveOp();
}

// También render en tiempo real usa safeEvalFull
const origPressDigit = pressDigit;
// Sobreescribimos render para que use safeEvalFull
function renderLive() {
    const liveResult = expr !== '' ? safeEvalFull(expr) : null;
    renderFull(liveResult);
}

/* =====================================================
   EVENTOS BOTONES CIENTÍFICOS
===================================================== */
document.querySelectorAll('.btn-sci[data-sci]').forEach(btn => {
    btn.addEventListener('click', () => {
        ripple(btn);
        pressSci(btn.dataset.sci);
    });
});

degBtn.addEventListener('click', () => { ripple(degBtn); toggleDeg(); });
invBtn.addEventListener('click', () => { ripple(invBtn); toggleInv(); });
sciToggle.addEventListener('click', toggleSci);

/* =====================================================
   TECLADO FÍSICO
===================================================== */
const KEY = {
    '0': 'd0', '1': 'd1', '2': 'd2', '3': 'd3', '4': 'd4',
    '5': 'd5', '6': 'd6', '7': 'd7', '8': 'd8', '9': 'd9',
    '.': 'decimal', ',': 'decimal',
    '+': 'op+', '-': 'op−', '*': 'op×', '/': 'op÷',
    '^': 'pow',
    'Enter': 'eq', '=': 'eq',
    'Backspace': 'del', 'Delete': 'clr', 'Escape': 'clr',
    '%': 'pct', '(': 'par', ')': 'par',
};
document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) return;
    const k = KEY[e.key]; if (!k) return;
    e.preventDefault();
    let sel = '';
    if (k.startsWith('d')) { pressDigit(k[1]); sel = `.btn[data-val="${k[1]}"]`; }
    else if (k === 'decimal') { pressDecimal(); sel = `.btn[data-val="."]`; }
    else if (k.startsWith('op')) { pressOperator(k.slice(2)); sel = `.btn[data-val="${k.slice(2)}"]`; }
    else if (k === 'pow') { pressSci('pow'); }
    else if (k === 'eq') { pressEqualsExt(); sel = `.btn[data-val="="]`; }
    else if (k === 'del') { pressDelete(); sel = `.btn[data-val="DEL"]`; }
    else if (k === 'clr') { pressClear(); sel = `.btn[data-val="AC"]`; }
    else if (k === 'pct') { pressPercent(); sel = `.btn[data-val="%"]`; }
    else if (k === 'par') { pressParen(); sel = `.btn[data-val="("]`; }
    const el = sel ? document.querySelector(sel) : null;
    if (el) { ripple(el); el.classList.add('kb-flash'); setTimeout(() => el.classList.remove('kb-flash'), 160); }
});

/* =====================================================
   HISTORIAL / TEMA
===================================================== */
histBtn.addEventListener('click', () => {
    histPanel.classList.toggle('open');
    histBtn.style.color = histPanel.classList.contains('open') ? 'var(--hist-res)' : '';
});
clearHist.addEventListener('click', () => { history = []; renderHistory(); });

themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.dataset.theme = next;
    localStorage.setItem('calc-theme', next);
});
const savedTheme = localStorage.getItem('calc-theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;