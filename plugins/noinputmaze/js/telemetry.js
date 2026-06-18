(() => {
    const STORAGE_KEY = "no-input-maze-playtest-v1";
    const RUN_LIMIT = 3;
    const exportButton = document.getElementById("telemetry-export");
    let currentRun = null;
    let pendingMonster = null;

    function loadState() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (stored && Array.isArray(stored.runs)) return stored;
        } catch (error) {}
        return { version: 1, runs: [], active: null, autoExportAttempted: false };
    }

    let state = loadState();
    state.active = null;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {}
    }

    function elapsedSeconds() {
        return currentRun ? (performance.now() - currentRun.startedAt) / 1000 : 0;
    }

    function rounded(value) {
        return Math.round(value * 100) / 100;
    }

    function record(type, details = {}) {
        if (!currentRun) return;
        currentRun.events.push({ time: rounded(elapsedSeconds()), type, ...details });
        state.active = currentRun;
        saveState();
    }

    function startRun() {
        if (state.runs.length >= RUN_LIMIT || currentRun) return;
        const world = window.noInputMazeWorld || {};
        currentRun = {
            number: state.runs.length + 1,
            startedAt: performance.now(),
            startedAtISO: new Date().toISOString(),
            initialHealth: world.health ?? 5,
            events: []
        };
        record("START", { health: currentRun.initialHealth });
        document.body.dataset.telemetryRun = `${currentRun.number}/${RUN_LIMIT}`;
    }

    function finishRun(outcome) {
        if (!currentRun) return;
        const world = window.noInputMazeWorld || {};
        record(outcome.toUpperCase(), {
            health: world.health ?? null,
            signals: world.signalsCollected ?? null,
            encounters: world.encounterCount ?? null
        });
        currentRun.outcome = outcome;
        currentRun.duration = rounded(elapsedSeconds());
        currentRun.finalHealth = world.health ?? null;
        currentRun.signals = world.signalsCollected ?? null;
        currentRun.encounters = world.encounterCount ?? null;
        delete currentRun.startedAt;
        state.runs.push(currentRun);
        currentRun = null;
        state.active = null;
        saveState();

        if (state.runs.length >= RUN_LIMIT) markReady();
    }

    function formatRun(run) {
        const lines = [
            `RUN ${run.number}`,
            `Started: ${run.startedAtISO}`,
            `Outcome: ${run.outcome.toUpperCase()}`,
            `Duration: ${run.duration.toFixed(2)} seconds`,
            `Final life: ${run.finalHealth}/10`,
            `Signals: ${run.signals}/5`,
            `Monster encounters: ${run.encounters}`,
            "Events:"
        ];
        run.events.forEach(event => {
            const details = Object.entries(event)
                .filter(([key]) => key !== "time" && key !== "type")
                .map(([key, value]) => `${key}=${value}`)
                .join(", ");
            lines.push(`  ${event.time.toFixed(2)}s  ${event.type}${details ? `  ${details}` : ""}`);
        });
        return lines.join("\n");
    }

    function playtestText() {
        const header = [
            "NO INPUT MAZE - THREE RUN PLAYTEST",
            `Generated: ${new Date().toISOString()}`,
            `Completed runs: ${state.runs.length}`,
            ""
        ].join("\n");
        return header + state.runs.map(formatRun).join("\n\n") + "\n";
    }

    function downloadData() {
        if (state.runs.length < RUN_LIMIT) return;
        const blob = new Blob([playtestText()], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "no-input-maze-playtest.txt";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function markReady() {
        document.body.dataset.telemetryReady = "true";
        exportButton.disabled = false;
        if (!state.autoExportAttempted) {
            state.autoExportAttempted = true;
            saveState();
            setTimeout(downloadData, 700);
        }
    }

    window.addEventListener("noinputmaze:entered", startRun);
    window.addEventListener("noinputmaze:enemyseen", event => {
        pendingMonster = event.detail;
    });
    window.addEventListener("noinputmaze:damage", event => {
        record("MONSTER", {
            monster: pendingMonster?.type || "unknown",
            health: event.detail.health
        });
        pendingMonster = null;
    });
    window.addEventListener("noinputmaze:signal", event => {
        record("SIGNAL", { number: event.detail.count });
    });
    window.addEventListener("noinputmaze:heal", event => {
        record("HEART", { health: event.detail.health });
    });
    window.addEventListener("noinputmaze:dead", () => finishRun("dead"));
    window.addEventListener("noinputmaze:won", () => finishRun("won"));
    exportButton.addEventListener("click", downloadData);

    if (state.runs.length >= RUN_LIMIT) markReady();
    saveState();
})();
