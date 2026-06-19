const PATCH_EXPORT_URL = "export/patch.export.json";

const INPORTS = Object.freeze({
    detonate: "triggerDetonation",
    stopDetonation: "stopDetonation",
    bgMusic: "triggerBGMusic",
    stopBGMusic: "stopBGMusic",
    victory: "triggerVictoryMusic",
    flag: "triggerFlag",
    unflag: "triggerUnFlag",
    clue: count => `trigger${count}Bomb`
});

const DIFFICULTIES = Object.freeze({
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 }
});

class RNBOAudioEngine {
    constructor() {
        this.context = null;
        this.device = null;
        this.output = null;
        this.ready = false;
        this.started = false;
        this.availableInports = new Set();
    }

    async load() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContextClass();
        this.output = this.context.createGain();
        this.output.gain.value = 0.9;
        this.output.connect(this.context.destination);

        const response = await fetch(PATCH_EXPORT_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`RNBO export failed to load (${response.status})`);
        const patcher = await response.json();

        if (!window.RNBO) await this.loadRuntime(patcher.desc.meta.rnboversion);
        this.device = await RNBO.createDevice({ context: this.context, patcher });

        try {
            const dependenciesResponse = await fetch("export/dependencies.json", { cache: "no-store" });
            if (dependenciesResponse.ok) {
                const dependencies = await dependenciesResponse.json();
                const mapped = dependencies.map(item => item.file ? { ...item, file: `export/${item.file}` } : item);
                if (mapped.length) await this.device.loadDataBufferDependencies(mapped);
            }
        } catch (error) {
            console.warn("Minescreamer: optional RNBO dependencies were not loaded.", error);
        }

        this.device.node.connect(this.output);
        const inports = this.device.inports || (this.device.messages || []).filter(message =>
            message.type === RNBO.MessagePortType.Inport
        );
        this.availableInports = new Set(inports.map(port => port.tag));
        this.ready = true;
        return patcher;
    }

    loadRuntime(version) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://c74-public.nyc3.digitaloceanspaces.com/rnbo/${encodeURIComponent(version)}/rnbo.min.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Could not load RNBO runtime ${version}`));
            document.body.appendChild(script);
        });
    }

    start() {
        if (!this.ready) return false;
        this.started = true;
        this.context.resume().catch(error => console.warn("Minescreamer: audio context did not resume yet.", error));
        return true;
    }

    send(tag, payload = [1]) {
        if (!this.ready || !this.started || !this.availableInports.has(tag)) return false;
        this.device.scheduleEvent(new RNBO.MessageEvent(RNBO.TimeNow, tag, payload));
        return true;
    }
}

const audio = new RNBOAudioEngine();
const elements = {
    gate: document.getElementById("audio-gate"),
    enter: document.getElementById("enter-game"),
    enterLabel: document.getElementById("enter-label"),
    audioStatus: document.getElementById("audio-status"),
    difficulty: document.getElementById("difficulty"),
    fieldSetup: document.getElementById("field-setup"),
    startField: document.getElementById("start-field"),
    newGame: document.getElementById("new-game"),
    musicToggle: document.getElementById("music-toggle"),
    mineCount: document.getElementById("mine-count"),
    timer: document.getElementById("timer"),
    statusText: document.getElementById("status-text"),
    statusPip: document.getElementById("status-pip"),
    boardMessage: document.getElementById("board-message"),
    holder: document.getElementById("canvas-holder"),
    announcer: document.getElementById("sr-announcer")
};

let musicEnabled = true;
let audioEntered = false;

function setAudioStatus(label, state = "") {
    elements.audioStatus.className = `audio-status ${state}`.trim();
    elements.audioStatus.querySelector("span:last-child").textContent = label;
}

function formatCounter(value) {
    const rounded = Math.trunc(value);
    return rounded < 0 ? `-${String(Math.abs(rounded)).padStart(2, "0")}` : String(rounded).padStart(3, "0");
}

function announce(message) {
    elements.announcer.textContent = "";
    requestAnimationFrame(() => { elements.announcer.textContent = message; });
}

async function bootAudio() {
    try {
        const patcher = await audio.load();
        const expected = [
            INPORTS.detonate, INPORTS.stopDetonation, INPORTS.bgMusic, INPORTS.stopBGMusic,
            INPORTS.victory, INPORTS.flag, INPORTS.unflag,
            ...Array.from({ length: 8 }, (_, index) => INPORTS.clue(index + 1))
        ];
        const missing = expected.filter(tag => !audio.availableInports.has(tag));
        if (missing.length) console.warn("Minescreamer: missing RNBO inports", missing);
        elements.enter.disabled = false;
        elements.enterLabel.textContent = "Enter the minefield";
        setAudioStatus(`RNBO ${patcher.desc.meta.rnboversion} · ready`, "ready");
    } catch (error) {
        console.error(error);
        elements.enterLabel.textContent = "Sound engine unavailable";
        setAudioStatus("Sound engine error", "error");
    }
}

elements.enter.addEventListener("click", () => {
    if (!audio.start()) return;
    audioEntered = true;
    elements.gate.classList.add("hidden");
    if (musicEnabled) audio.send(INPORTS.bgMusic);
    if (elements.fieldSetup.classList.contains("visible")) elements.startField.focus();
    else elements.holder.focus();
});

elements.musicToggle.addEventListener("click", () => {
    musicEnabled = !musicEnabled;
    elements.musicToggle.setAttribute("aria-pressed", String(musicEnabled));
    elements.musicToggle.setAttribute("aria-label", musicEnabled ? "Mute background music" : "Play background music");
    if (!audioEntered) return;
    audio.send(musicEnabled ? INPORTS.bgMusic : INPORTS.stopBGMusic);
});

document.querySelectorAll("[data-sound]").forEach(button => {
    button.addEventListener("click", () => {
        const count = Number(button.dataset.sound);
        audio.send(INPORTS.clue(count));
        button.classList.add("is-playing");
        window.setTimeout(() => button.classList.remove("is-playing"), 460);
        announce(`${count} adjacent ${count === 1 ? "mine" : "mines"}`);
    });
});

const MinescreamerSketch = p => {
    let config = DIFFICULTIES[elements.difficulty.value];
    let board = [];
    let minesPlaced = false;
    let gameState = "ready";
    let flags = 0;
    let revealedSafe = 0;
    let startTime = 0;
    let elapsedSeconds = 0;
    let cellSize = 32;
    let cursorRow = 0;
    let cursorCol = 0;
    let particles = [];
    let flash = 0;
    let canvas;

    function makeBoard() {
        return Array.from({ length: config.rows }, (_, row) =>
            Array.from({ length: config.cols }, (_, col) => ({
                row, col, mine: false, revealed: false, flagged: false,
                adjacent: 0, pulse: 0, exploded: false
            }))
        );
    }

    function resizeBoard() {
        const shellWidth = Math.max(280, document.getElementById("board-shell").clientWidth - 50);
        const maxCell = config.cols <= 9 ? 48 : config.cols <= 16 ? 38 : 29;
        cellSize = Math.max(20, Math.min(maxCell, Math.floor(shellWidth / config.cols)));
        p.resizeCanvas(config.cols * cellSize, config.rows * cellSize);
    }

    function updateStatus() {
        elements.mineCount.textContent = formatCounter(config.mines - flags);
        elements.timer.textContent = formatCounter(elapsedSeconds);
        elements.statusPip.className = "status-pip";
        if (gameState === "ready") elements.statusText.textContent = "Field unbroken";
        if (gameState === "playing") elements.statusText.textContent = "Listening";
        if (gameState === "lost") {
            elements.statusText.textContent = "Signal lost";
            elements.statusPip.classList.add("danger");
        }
        if (gameState === "won") {
            elements.statusText.textContent = "Field cleared";
            elements.statusPip.classList.add("victory");
        }
    }

    function hideMessage() {
        elements.boardMessage.classList.remove("visible");
        elements.boardMessage.innerHTML = "";
    }

    function showMessage(title, subtitle) {
        elements.boardMessage.innerHTML = `<div>${title}<small>${subtitle}</small></div>`;
        elements.boardMessage.classList.add("visible");
    }

    function restartMusic() {
        if (!audioEntered) return;
        audio.send(INPORTS.stopDetonation);
        audio.send(INPORTS.stopBGMusic);
        if (musicEnabled) window.setTimeout(() => audio.send(INPORTS.bgMusic), 45);
    }

    function resetGame(nextDifficulty = elements.difficulty.value, showSetup = false) {
        config = DIFFICULTIES[nextDifficulty];
        board = makeBoard();
        minesPlaced = false;
        gameState = "ready";
        flags = 0;
        revealedSafe = 0;
        startTime = 0;
        elapsedSeconds = 0;
        cursorRow = 0;
        cursorCol = 0;
        particles = [];
        flash = 0;
        hideMessage();
        elements.fieldSetup.classList.toggle("visible", showSetup);
        resizeBoard();
        updateStatus();
        restartMusic();
        announce(showSetup ? "Choose a field difficulty." : "New minefield. First reveal is safe.");
    }

    function neighbors(row, col) {
        const cells = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const rr = row + dr;
                const cc = col + dc;
                if (rr >= 0 && rr < config.rows && cc >= 0 && cc < config.cols) cells.push(board[rr][cc]);
            }
        }
        return cells;
    }

    function boardIsLogicallySolvable(startRow, startCol) {
        const totalCells = config.rows * config.cols;
        const cellIndex = cell => cell.row * config.cols + cell.col;
        const cellAtIndex = index => board[Math.floor(index / config.cols)][index % config.cols];
        const adjacentIndexes = index => {
            const cell = cellAtIndex(index);
            return neighbors(cell.row, cell.col).map(cellIndex);
        };
        const simulatedRevealed = new Set();
        const simulatedFlags = new Set();

        const revealSimulated = indexes => {
            const queue = [...indexes];
            while (queue.length) {
                const index = queue.shift();
                if (simulatedRevealed.has(index) || simulatedFlags.has(index)) continue;
                const cell = cellAtIndex(index);
                if (cell.mine) return false;
                simulatedRevealed.add(index);
                if (cell.adjacent === 0) adjacentIndexes(index).forEach(next => queue.push(next));
            }
            return true;
        };

        revealSimulated([startRow * config.cols + startCol]);

        for (let guard = 0; guard < totalCells * 4; guard++) {
            let progressed = false;
            const constraints = [];

            for (const index of simulatedRevealed) {
                const cell = cellAtIndex(index);
                if (cell.adjacent === 0) continue;
                const around = adjacentIndexes(index);
                const unknown = around.filter(next => !simulatedRevealed.has(next) && !simulatedFlags.has(next));
                const knownMines = around.filter(next => simulatedFlags.has(next)).length;
                const remainingMines = cell.adjacent - knownMines;
                if (!unknown.length) continue;

                if (remainingMines === 0) {
                    const before = simulatedRevealed.size;
                    revealSimulated(unknown);
                    progressed ||= simulatedRevealed.size > before;
                } else if (remainingMines === unknown.length) {
                    const before = simulatedFlags.size;
                    unknown.forEach(next => simulatedFlags.add(next));
                    progressed ||= simulatedFlags.size > before;
                } else {
                    constraints.push({ cells: new Set(unknown), mines: remainingMines });
                }
            }

            if (simulatedRevealed.size === totalCells - config.mines) return true;
            if (progressed) continue;

            const deducedSafe = new Set();
            const deducedMines = new Set();
            for (const smaller of constraints) {
                for (const larger of constraints) {
                    if (smaller.cells.size >= larger.cells.size) continue;
                    const isSubset = [...smaller.cells].every(index => larger.cells.has(index));
                    if (!isSubset) continue;
                    const difference = [...larger.cells].filter(index => !smaller.cells.has(index));
                    const minesInDifference = larger.mines - smaller.mines;
                    if (minesInDifference === 0) difference.forEach(index => deducedSafe.add(index));
                    if (minesInDifference === difference.length) difference.forEach(index => deducedMines.add(index));
                }
            }

            deducedSafe.forEach(index => {
                if (simulatedFlags.has(index)) deducedSafe.delete(index);
            });
            deducedMines.forEach(index => {
                if (simulatedRevealed.has(index)) deducedMines.delete(index);
            });

            if (!deducedSafe.size && !deducedMines.size) return false;
            deducedMines.forEach(index => simulatedFlags.add(index));
            if (!revealSimulated(deducedSafe)) return false;
        }
        return false;
    }

    function placeMines(safeRow, safeCol) {
        const safe = new Set([`${safeRow},${safeCol}`]);
        neighbors(safeRow, safeCol).forEach(cell => safe.add(`${cell.row},${cell.col}`));
        const candidates = [];
        for (let row = 0; row < config.rows; row++) {
            for (let col = 0; col < config.cols; col++) {
                if (!safe.has(`${row},${col}`)) candidates.push(board[row][col]);
            }
        }
        let attempts = 0;
        let solvable = false;
        while (!solvable) {
            attempts++;
            board.flat().forEach(cell => {
                cell.mine = false;
                cell.adjacent = 0;
            });
            for (let index = candidates.length - 1; index > 0; index--) {
                const swap = Math.floor(Math.random() * (index + 1));
                [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
            }
            candidates.slice(0, config.mines).forEach(cell => { cell.mine = true; });
            board.flat().forEach(cell => {
                cell.adjacent = neighbors(cell.row, cell.col).filter(item => item.mine).length;
            });
            solvable = boardIsLogicallySolvable(safeRow, safeCol);
        }
        minesPlaced = true;
        console.info(`Minescreamer: generated a no-guess field in ${attempts} ${attempts === 1 ? "attempt" : "attempts"}.`);
    }

    function emitParticles(cell, colour, amount = 7) {
        const x = (cell.col + 0.5) * cellSize;
        const y = (cell.row + 0.5) * cellSize;
        for (let i = 0; i < amount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.6 + Math.random() * 2.3;
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, colour });
        }
    }

    function playClue(cell) {
        cell.pulse = p.millis();
        if (cell.adjacent > 0) {
            audio.send(INPORTS.clue(cell.adjacent));
            emitParticles(cell, cell.adjacent >= 6 ? "#ff503c" : "#d8ff3e", 4 + cell.adjacent);
            announce(`${cell.adjacent} adjacent ${cell.adjacent === 1 ? "mine" : "mines"}`);
        } else {
            announce("Clear. No adjacent mines.");
        }
    }

    function revealFlood(startCell) {
        const queue = [startCell];
        const visited = new Set();
        while (queue.length) {
            const cell = queue.shift();
            const key = `${cell.row},${cell.col}`;
            if (visited.has(key) || cell.flagged || cell.mine) continue;
            visited.add(key);
            if (!cell.revealed) {
                cell.revealed = true;
                revealedSafe++;
            }
            if (cell.adjacent === 0) neighbors(cell.row, cell.col).forEach(next => {
                if (!next.mine && !next.flagged) queue.push(next);
            });
        }
    }

    function checkWin() {
        if (revealedSafe !== config.rows * config.cols - config.mines) return false;
        gameState = "won";
        elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        audio.send(INPORTS.stopBGMusic);
        window.setTimeout(() => audio.send(INPORTS.victory), 60);
        updateStatus();
        showMessage("FIELD CLEARED", `${elapsedSeconds} seconds · ${flags} flags placed`);
        announce(`Victory. Field cleared in ${elapsedSeconds} seconds.`);
        return true;
    }

    function lose(cell) {
        gameState = "lost";
        cell.exploded = true;
        board.flat().forEach(item => { if (item.mine) item.revealed = true; });
        flash = 1;
        audio.send(INPORTS.stopBGMusic);
        audio.send(INPORTS.detonate);
        emitParticles(cell, "#ff503c", 70);
        updateStatus();
        showMessage("YOU FOUND IT", "The minefield screamed back · start a new field to continue");
        announce("Mine detonated. Game over.");
    }

    function reveal(row, col, replayOnly = false) {
        if (gameState === "lost" || gameState === "won") return;
        const cell = board[row]?.[col];
        if (!cell || cell.flagged) return;
        if (cell.revealed) {
            playClue(cell);
            return;
        }
        if (replayOnly) return;
        if (!minesPlaced) {
            placeMines(row, col);
            gameState = "playing";
            startTime = Date.now();
            updateStatus();
        }
        if (cell.mine) {
            lose(cell);
            return;
        }
        if (cell.adjacent === 0) revealFlood(cell);
        else {
            cell.revealed = true;
            revealedSafe++;
        }
        playClue(cell);
        checkWin();
    }

    function toggleFlag(row, col) {
        if (gameState === "lost" || gameState === "won") return;
        const cell = board[row]?.[col];
        if (!cell || cell.revealed) return;
        cell.flagged = !cell.flagged;
        flags += cell.flagged ? 1 : -1;
        audio.send(cell.flagged ? INPORTS.flag : INPORTS.unflag);
        emitParticles(cell, cell.flagged ? "#5d73ff" : "#8f8c83", 8);
        updateStatus();
        announce(cell.flagged ? "Flag placed." : "Flag removed.");
    }

    function chord(row, col) {
        if (gameState !== "playing") return;
        const cell = board[row]?.[col];
        if (!cell?.revealed || cell.adjacent === 0) return;
        const around = neighbors(row, col);
        const flaggedAround = around.filter(item => item.flagged).length;
        if (flaggedAround !== cell.adjacent) {
            playClue(cell);
            announce(`Chord needs ${cell.adjacent} adjacent flags; ${flaggedAround} placed.`);
            return;
        }
        for (const next of around) {
            if (!next.flagged && !next.revealed) {
                reveal(next.row, next.col);
                if (gameState === "lost") break;
            }
        }
    }

    function cellFromPointer() {
        const col = Math.floor(p.mouseX / cellSize);
        const row = Math.floor(p.mouseY / cellSize);
        if (row < 0 || row >= config.rows || col < 0 || col >= config.cols) return null;
        return board[row][col];
    }

    function drawFlag(x, y, size) {
        p.noStroke();
        p.fill("#5d73ff");
        p.triangle(x - size * .13, y - size * .22, x + size * .19, y - size * .08, x - size * .13, y + size * .03);
        p.stroke("#11110f");
        p.strokeWeight(Math.max(1.5, size * .045));
        p.line(x - size * .13, y - size * .22, x - size * .13, y + size * .22);
        p.line(x - size * .24, y + size * .22, x + size * .04, y + size * .22);
    }

    function drawMine(x, y, size, exploded) {
        p.push();
        p.translate(x, y);
        p.stroke(exploded ? "#fff2e7" : "#11110f");
        p.strokeWeight(Math.max(1.5, size * .05));
        for (let i = 0; i < 8; i++) {
            const angle = i * p.PI / 4;
            p.line(Math.cos(angle) * size * .12, Math.sin(angle) * size * .12, Math.cos(angle) * size * .31, Math.sin(angle) * size * .31);
        }
        p.noStroke();
        p.fill(exploded ? "#ff503c" : "#171714");
        p.circle(0, 0, size * .35);
        p.fill("#ede9df");
        p.circle(-size * .055, -size * .06, size * .07);
        p.pop();
    }

    function drawCell(cell) {
        const x = cell.col * cellSize;
        const y = cell.row * cellSize;
        const hovered = p.mouseX >= x && p.mouseX < x + cellSize && p.mouseY >= y && p.mouseY < y + cellSize;
        const focused = cell.row === cursorRow && cell.col === cursorCol && document.activeElement === elements.holder;

        p.stroke(17, 17, 15, cell.revealed ? 36 : 55);
        p.strokeWeight(1);
        if (cell.revealed) {
            p.fill(cell.exploded ? "#ff503c" : ((cell.row + cell.col) % 2 ? "#e7e2d7" : "#eeeae1"));
            p.rect(x, y, cellSize, cellSize);
            p.noStroke();
            p.fill(17, 17, 15, 16);
            p.circle(x + cellSize * .5, y + cellSize * .5, cellSize * .12);
            if (cell.mine) drawMine(x + cellSize / 2, y + cellSize / 2, cellSize, cell.exploded);
        } else {
            const base = (cell.row + cell.col) % 2 ? 174 : 183;
            p.fill(hovered ? base + 12 : base, hovered ? base + 11 : base - 3, hovered ? base + 7 : base - 10);
            p.rect(x, y, cellSize, cellSize);
            p.stroke(255, 255, 255, 65);
            p.line(x + 1, y + 1, x + cellSize - 1, y + 1);
            p.line(x + 1, y + 1, x + 1, y + cellSize - 1);
            if (cell.flagged) drawFlag(x + cellSize / 2, y + cellSize / 2, cellSize);
        }

        const pulseAge = p.millis() - cell.pulse;
        if (pulseAge >= 0 && pulseAge < 650) {
            const progress = pulseAge / 650;
            p.noFill();
            p.stroke(cell.adjacent >= 6 ? 255 : 216, cell.adjacent >= 6 ? 80 : 255, cell.adjacent >= 6 ? 60 : 62, 180 * (1 - progress));
            p.strokeWeight(2);
            p.circle(x + cellSize / 2, y + cellSize / 2, cellSize * (.25 + progress * 1.2));
        }

        if (focused) {
            p.noFill();
            p.stroke("#5d73ff");
            p.strokeWeight(Math.max(2, cellSize * .075));
            p.rect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        }
    }

    function drawParticles() {
        particles = particles.filter(particle => particle.life > 0);
        particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.025;
            particle.life -= 0.025;
            p.noStroke();
            const colour = p.color(particle.colour);
            colour.setAlpha(255 * particle.life);
            p.fill(colour);
            p.circle(particle.x, particle.y, 2 + particle.life * 4);
        });
    }

    p.setup = () => {
        canvas = p.createCanvas(640, 640);
        canvas.parent(elements.holder);
        canvas.elt.setAttribute("aria-hidden", "true");
        canvas.elt.addEventListener("contextmenu", event => event.preventDefault());
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
        p.frameRate(30);
        resetGame(elements.difficulty.value, true);
    };

    p.draw = () => {
        p.background("#c9c4b8");
        board.flat().forEach(drawCell);
        drawParticles();

        if (gameState === "playing") {
            const nextSeconds = Math.floor((Date.now() - startTime) / 1000);
            if (nextSeconds !== elapsedSeconds) {
                elapsedSeconds = nextSeconds;
                elements.timer.textContent = formatCounter(elapsedSeconds);
            }
        }
        if (flash > 0) {
            p.noStroke();
            p.fill(255, 80, 60, flash * 170);
            p.rect(0, 0, p.width, p.height);
            flash *= 0.82;
        }
    };

    p.mousePressed = event => {
        if (!audioEntered) return false;
        const cell = cellFromPointer();
        if (!cell) return false;
        cursorRow = cell.row;
        cursorCol = cell.col;
        if (event.button === 2) toggleFlag(cell.row, cell.col);
        else reveal(cell.row, cell.col);
        elements.holder.focus();
        return false;
    };

    p.doubleClicked = event => {
        if (event.button !== 2) {
            const cell = cellFromPointer();
            if (cell) chord(cell.row, cell.col);
        }
        return false;
    };

    p.windowResized = () => resizeBoard();

    elements.holder.addEventListener("keydown", event => {
        const handled = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "f", "F", "r", "R", "c", "C"].includes(event.key);
        if (handled) event.preventDefault();
        if (event.key === "ArrowUp") cursorRow = Math.max(0, cursorRow - 1);
        if (event.key === "ArrowDown") cursorRow = Math.min(config.rows - 1, cursorRow + 1);
        if (event.key === "ArrowLeft") cursorCol = Math.max(0, cursorCol - 1);
        if (event.key === "ArrowRight") cursorCol = Math.min(config.cols - 1, cursorCol + 1);
        if (event.key === "Enter" || event.key === " ") reveal(cursorRow, cursorCol);
        if (event.key === "f" || event.key === "F") toggleFlag(cursorRow, cursorCol);
        if (event.key === "r" || event.key === "R") {
            const cell = board[cursorRow][cursorCol];
            if (cell.revealed) playClue(cell);
        }
        if (event.key === "c" || event.key === "C") chord(cursorRow, cursorCol);
    });

    elements.newGame.addEventListener("click", () => {
        resetGame(elements.difficulty.value, true);
        elements.startField.focus();
    });
    elements.difficulty.addEventListener("change", () => resetGame(elements.difficulty.value, true));
    elements.startField.addEventListener("click", () => {
        resetGame(elements.difficulty.value, false);
        elements.holder.focus();
    });

    window.__minescreamer = {
        getState: () => ({
            rows: config.rows, cols: config.cols, mines: config.mines, flags,
            revealedSafe, minesPlaced, gameState, elapsedSeconds,
            board: board.map(row => row.map(cell => ({ mine: cell.mine, revealed: cell.revealed, flagged: cell.flagged, adjacent: cell.adjacent })))
        }),
        newGame: resetGame,
        revealAt: reveal,
        flagAt: toggleFlag,
        chordAt: chord,
        playClue: count => audio.send(INPORTS.clue(count)),
        audio
    };
};

new p5(MinescreamerSketch);
bootAudio();
