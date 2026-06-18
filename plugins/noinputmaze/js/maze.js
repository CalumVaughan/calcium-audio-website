const MAZE_INITIAL_MAP = [
    "1111111111111111",
    "1000001000000001",
    "1011101011111101",
    "1010001000000101",
    "1010111110110101",
    "1000100000100101",
    "1110101111100101",
    "1000101000000101",
    "1011101011111101",
    "1010000010000001",
    "1010111110111101",
    "1010100000100001",
    "1010101111101101",
    "1000001000000101",
    "1011111011110001",
    "1111111111111111"
];

const mazeMap = MAZE_INITIAL_MAP.map(row => row.split(""));
const mazePlayer = { x: 1.7, y: 1.7, angle: 0.18, fov: Math.PI / 2.8 };
const mazeKeys = new Set();
const MAZE_MOVE_SPEED = 2.35;
const MAZE_MOUSE_SENSITIVITY = 0.0022;
const MAZE_COLLISION_RADIUS = 0.16;
let mazePendingMouseX = 0;
const MAZE_ENEMY_CELLS = [
    [5, 1], [7, 1], [14, 1], [3, 3], [5, 3], [7, 3], [12, 3],
    [1, 5], [5, 5], [9, 5], [11, 5], [1, 7], [3, 7], [7, 7],
    [12, 7], [3, 9], [7, 9], [9, 9], [5, 11], [9, 11], [11, 11],
    [5, 13], [7, 13], [12, 13], [12, 14], [14, 14]
];
const MAZE_SIGNAL_POSITIONS = [
    [14.5, 1.5], [12.5, 7.5], [5.5, 11.5], [7.5, 14.5], [14.5, 14.5]
];
const MAZE_EXIT_POSITION = [1.5, 14.5];
const MAZE_PORTALS = [
    { from: [5, 3], to: [9.5, 11.5], turn: Math.PI / 2 },
    { from: [9, 11], to: [5.5, 3.5], turn: -Math.PI / 2 }
];

const mazeWorld = {
    signalsCollected: 0,
    signalTotal: MAZE_SIGNAL_POSITIONS.length,
    mutationCount: 0,
    anomalyActive: false,
    health: 5,
    maxHealth: 10,
    encounterCount: 0,
    ended: null
};
window.noInputMazeWorld = mazeWorld;

function mazeIsWall(x, y, map = mazeMap) {
    const mapX = Math.floor(x);
    const mapY = Math.floor(y);
    return !map[mapY] || map[mapY][mapX] !== "0";
}

function mazeCanOccupy(x, y) {
    const radius = MAZE_COLLISION_RADIUS;
    return !mazeIsWall(x - radius, y - radius)
        && !mazeIsWall(x + radius, y - radius)
        && !mazeIsWall(x - radius, y + radius)
        && !mazeIsWall(x + radius, y + radius);
}

function mazeOpenNeighbors(cellX, cellY, map = mazeMap) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]]
        .map(([offsetX, offsetY]) => [cellX + offsetX, cellY + offsetY])
        .filter(([x, y]) => !mazeIsWall(x + 0.5, y + 0.5, map));
}

function mazeCellIsCorner(cellX, cellY) {
    const neighbors = mazeOpenNeighbors(cellX, cellY);
    return neighbors.length === 2
        && neighbors[0][0] !== neighbors[1][0]
        && neighbors[0][1] !== neighbors[1][1];
}

function normalizeMazeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function updateMazePlayer(deltaSeconds) {
    if (document.body.dataset.entered !== "true" || mazeWorld.ended) return;

    const forward = (mazeKeys.has("KeyW") ? 1 : 0) - (mazeKeys.has("KeyS") ? 1 : 0);
    const strafe = (mazeKeys.has("KeyD") ? 1 : 0) - (mazeKeys.has("KeyA") ? 1 : 0);
    if (forward === 0 && strafe === 0) return;

    const magnitude = Math.hypot(forward, strafe) || 1;
    const forwardX = Math.cos(mazePlayer.angle);
    const forwardY = Math.sin(mazePlayer.angle);
    const rightX = Math.cos(mazePlayer.angle + Math.PI / 2);
    const rightY = Math.sin(mazePlayer.angle + Math.PI / 2);
    const step = MAZE_MOVE_SPEED * deltaSeconds;
    const moveX = (forwardX * forward + rightX * strafe) / magnitude * step;
    const moveY = (forwardY * forward + rightY * strafe) / magnitude * step;
    const nextX = mazePlayer.x + moveX;
    const nextY = mazePlayer.y + moveY;

    if (mazeCanOccupy(nextX, mazePlayer.y)) mazePlayer.x = nextX;
    if (mazeCanOccupy(mazePlayer.x, nextY)) mazePlayer.y = nextY;
}

function updateMazeLook(deltaSeconds) {
    if (!document.pointerLockElement) {
        mazePendingMouseX = 0;
        return;
    }
    const smoothing = 1 - Math.exp(-deltaSeconds * 48);
    const appliedMouseX = mazePendingMouseX * smoothing;
    mazePlayer.angle += appliedMouseX * MAZE_MOUSE_SENSITIVITY;
    mazePendingMouseX -= appliedMouseX;
    if (Math.abs(mazePendingMouseX) < 0.01) mazePendingMouseX = 0;
}

window.addEventListener("keydown", event => {
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        mazeKeys.add(event.code);
        event.preventDefault();
    }
});
window.addEventListener("keyup", event => mazeKeys.delete(event.code));
window.addEventListener("blur", () => mazeKeys.clear());
document.addEventListener("mousemove", event => {
    if (document.pointerLockElement) {
        mazePendingMouseX = Math.max(-240, Math.min(240, mazePendingMouseX + event.movementX));
    }
});
document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) mazePendingMouseX = 0;
});

function castMazeRay(angle) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let mapX = Math.floor(mazePlayer.x);
    let mapY = Math.floor(mazePlayer.y);
    const deltaX = Math.abs(1 / (dirX || 0.00001));
    const deltaY = Math.abs(1 / (dirY || 0.00001));
    const stepX = dirX < 0 ? -1 : 1;
    const stepY = dirY < 0 ? -1 : 1;
    let sideX = dirX < 0
        ? (mazePlayer.x - mapX) * deltaX
        : (mapX + 1 - mazePlayer.x) * deltaX;
    let sideY = dirY < 0
        ? (mazePlayer.y - mapY) * deltaY
        : (mapY + 1 - mazePlayer.y) * deltaY;
    let side = 0;

    for (let step = 0; step < 64; step += 1) {
        if (sideX < sideY) {
            sideX += deltaX;
            mapX += stepX;
            side = 0;
        } else {
            sideY += deltaY;
            mapY += stepY;
            side = 1;
        }
        if (mazeIsWall(mapX, mapY)) break;
    }

    const distance = side === 0
        ? (mapX - mazePlayer.x + (1 - stepX) / 2) / dirX
        : (mapY - mazePlayer.y + (1 - stepY) / 2) / dirY;
    const hitX = mazePlayer.x + distance * dirX;
    const hitY = mazePlayer.y + distance * dirY;
    const wallOffset = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
    return { distance: Math.max(0.05, distance), side, wallOffset };
}

function mazePointIsVisible(x, y) {
    const dx = x - mazePlayer.x;
    const dy = y - mazePlayer.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const angleFromView = normalizeMazeAngle(angle - mazePlayer.angle);
    if (Math.abs(angleFromView) > mazePlayer.fov * 0.58) return false;
    return castMazeRay(angle).distance >= distance - 0.18;
}

function mazeMapIsConnected(map) {
    let firstOpen = null;
    let openCount = 0;
    for (let y = 1; y < map.length - 1; y += 1) {
        for (let x = 1; x < map[y].length - 1; x += 1) {
            if (map[y][x] === "0") {
                openCount += 1;
                if (!firstOpen) firstOpen = [x, y];
            }
        }
    }
    if (!firstOpen) return false;

    const queue = [firstOpen];
    const visited = new Set([firstOpen.join(",")]);
    for (let index = 0; index < queue.length; index += 1) {
        const [x, y] = queue[index];
        mazeOpenNeighbors(x, y, map).forEach(neighbor => {
            const key = neighbor.join(",");
            if (!visited.has(key)) {
                visited.add(key);
                queue.push(neighbor);
            }
        });
    }
    return visited.size === openCount;
}

function mazeNextStepToward(fromX, fromY, toX, toY) {
    const start = [Math.floor(fromX), Math.floor(fromY)];
    const goalKey = `${Math.floor(toX)},${Math.floor(toY)}`;
    const queue = [start];
    const previous = new Map([[start.join(","), null]]);

    for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        const currentKey = current.join(",");
        if (currentKey === goalKey) break;
        mazeOpenNeighbors(current[0], current[1]).forEach(neighbor => {
            const key = neighbor.join(",");
            if (!previous.has(key)) {
                previous.set(key, currentKey);
                queue.push(neighbor);
            }
        });
    }

    if (!previous.has(goalKey)) return null;
    let cursor = goalKey;
    let parent = previous.get(cursor);
    const startKey = start.join(",");
    while (parent && parent !== startKey) {
        cursor = parent;
        parent = previous.get(cursor);
    }
    return cursor.split(",").map(Number);
}

new p5(p => {
    let grain;
    let mazeCanvas;
    let enemy = null;
    let gameStartedAt = null;
    let nextEnemySpawn = Infinity;
    let lastPlayerCell = `${Math.floor(mazePlayer.x)},${Math.floor(mazePlayer.y)}`;
    let portalCooldownUntil = 0;
    let pendingMutationAt = null;
    let mutationPulse = 0;
    let encounterPulse = 0;
    let damageEncounterAt = null;
    let bloodOrb = null;
    let nextBloodOrbRoll = Infinity;
    let forcedEncounterPending = false;
    const scars = [];
    const signalNodes = MAZE_SIGNAL_POSITIONS.map(([x, y], index) => ({ x, y, index, collected: false }));

    function audioValue(name) {
        return window.noInputMazeAudioState?.[name] || 0;
    }

    function captureMazePointer() {
        if (mazeWorld.ended) return;
        const request = mazeCanvas.requestPointerLock();
        if (request && typeof request.catch === "function") request.catch(() => {});
    }

    function buildGrain() {
        if (grain) grain.remove();
        grain = p.createGraphics(Math.max(1, p.floor(p.width / 4)), Math.max(1, p.floor(p.height / 4)));
        grain.pixelDensity(1);
        grain.loadPixels();
        for (let i = 0; i < grain.pixels.length; i += 4) {
            const value = p.random() > 0.52 ? 255 : 0;
            grain.pixels[i] = value;
            grain.pixels[i + 1] = value;
            grain.pixels[i + 2] = value;
            grain.pixels[i + 3] = p.random(4, 18);
        }
        grain.updatePixels();
    }

    function makeEnemy(x, y, options = {}) {
        return {
            x,
            y,
            type: options.type || p.random(["orb", "crawler", "watcher"]),
            seed: p.random(1000),
            bornAt: p.millis(),
            seenAt: null,
            deadEndSpawn: Boolean(options.deadEndSpawn)
        };
    }

    function requiredEncounterCount() {
        if (mazeWorld.signalsCollected >= 5) return 3;
        if (mazeWorld.signalsCollected >= 4) return 2;
        if (mazeWorld.signalsCollected >= 2) return 1;
        return 0;
    }

    function exitIsReady() {
        return mazeWorld.signalsCollected === mazeWorld.signalTotal
            && (mazeWorld.encounterCount >= 3 || mazeWorld.health <= 1);
    }

    function refreshEncounterDirector() {
        forcedEncounterPending = mazeWorld.health > 1
            && mazeWorld.encounterCount < requiredEncounterCount();
        if (forcedEncounterPending) nextEnemySpawn = Math.min(nextEnemySpawn, p.millis() + 900);
    }

    function spawnHiddenEnemy() {
        const spawnCells = [];
        for (let y = 1; y < mazeMap.length - 1; y += 1) {
            for (let x = 1; x < mazeMap[y].length - 1; x += 1) {
                if (!mazeIsWall(x + 0.5, y + 0.5) && mazeCellIsCorner(x, y)) spawnCells.push([x, y]);
            }
        }

        const maximumDistance = forcedEncounterPending ? 5.5 : 3.5;
        const candidates = spawnCells.map(([cellX, cellY]) => {
            const x = cellX + 0.5;
            const y = cellY + 0.5;
            const distance = Math.hypot(x - mazePlayer.x, y - mazePlayer.y);
            return { cellX, cellY, x, y, distance };
        }).filter(candidate => !mazeIsWall(candidate.x, candidate.y)
            && candidate.distance > 1.25
            && candidate.distance < maximumDistance
            && (!bloodOrb || Math.hypot(candidate.x - bloodOrb.x, candidate.y - bloodOrb.y) > 0.5)
            && !mazePointIsVisible(candidate.x, candidate.y))
            .sort((a, b) => a.distance - b.distance);
        if (!candidates.length) {
            nextEnemySpawn = p.millis() + (forcedEncounterPending ? 320 : 650);
            return;
        }
        const candidatePool = candidates.slice(0, Math.min(forcedEncounterPending ? 3 : 2, candidates.length));
        const candidate = p.random(candidatePool);
        enemy = makeEnemy(candidate.x, candidate.y, { directed: forcedEncounterPending });
        forcedEncounterPending = false;
    }

    function checkDeadEndEntry() {
        if (gameStartedAt === null || p.millis() - gameStartedAt < 20000) return;
        const cellX = Math.floor(mazePlayer.x);
        const cellY = Math.floor(mazePlayer.y);
        const cellKey = `${cellX},${cellY}`;
        if (cellKey === lastPlayerCell) return;
        lastPlayerCell = cellKey;

        const openNeighbors = mazeOpenNeighbors(cellX, cellY);
        if (openNeighbors.length !== 1 || p.random() >= 0.5) return;
        if (enemy && enemy.seenAt !== null) return;

        const [entranceX, entranceY] = openNeighbors[0];
        enemy = makeEnemy(entranceX + 0.5, entranceY + 0.5, { deadEndSpawn: true });
    }

    function addScar(x, y, type = "encounter") {
        scars.push({ x, y, type, seed: p.random(1000), bornAt: p.millis() });
        if (scars.length > 14) scars.shift();
    }

    function scheduleMutation(delay = 700) {
        pendingMutationAt = p.millis() + delay;
    }

    function mutateMazeOutOfSight() {
        const reserved = new Set(signalNodes.filter(node => !node.collected)
            .map(node => `${Math.floor(node.x)},${Math.floor(node.y)}`));
        reserved.add(`${Math.floor(MAZE_EXIT_POSITION[0])},${Math.floor(MAZE_EXIT_POSITION[1])}`);
        if (bloodOrb) reserved.add(`${Math.floor(bloodOrb.x)},${Math.floor(bloodOrb.y)}`);
        const playerX = Math.floor(mazePlayer.x);
        const playerY = Math.floor(mazePlayer.y);
        const candidates = [];

        for (let y = 1; y < mazeMap.length - 1; y += 1) {
            for (let x = 1; x < mazeMap[y].length - 1; x += 1) {
                const distance = Math.hypot(x - playerX, y - playerY);
                if (distance < 3 || reserved.has(`${x},${y}`) || mazePointIsVisible(x + 0.5, y + 0.5)) continue;
                const neighbors = mazeOpenNeighbors(x, y);
                if (mazeMap[y][x] === "1" && neighbors.length >= 2) candidates.push([x, y, "0"]);
                if (mazeMap[y][x] === "0" && neighbors.length >= 3) candidates.push([x, y, "1"]);
            }
        }

        for (let attempt = 0; attempt < 30 && candidates.length; attempt += 1) {
            const [x, y, nextValue] = p.random(candidates);
            const previousValue = mazeMap[y][x];
            mazeMap[y][x] = nextValue;
            if (mazeMapIsConnected(mazeMap)) {
                mazeWorld.mutationCount += 1;
                mutationPulse = 1;
                addScar(x + 0.5, y + 0.5, "mutation");
                return;
            }
            mazeMap[y][x] = previousValue;
        }
    }

    function checkMutation() {
        if (pendingMutationAt !== null && p.millis() >= pendingMutationAt) {
            pendingMutationAt = null;
            mutateMazeOutOfSight();
        }
        mutationPulse *= 0.94;
    }

    function checkPortalTraversal() {
        if (mazeWorld.signalsCollected < 2 || p.millis() < portalCooldownUntil) return;
        const cellX = Math.floor(mazePlayer.x);
        const cellY = Math.floor(mazePlayer.y);
        const portal = MAZE_PORTALS.find(item => item.from[0] === cellX && item.from[1] === cellY);
        if (!portal) return;

        addScar(mazePlayer.x, mazePlayer.y, "portal");
        mazePlayer.x = portal.to[0];
        mazePlayer.y = portal.to[1];
        mazePlayer.angle += portal.turn;
        portalCooldownUntil = p.millis() + 2400;
        mazeWorld.anomalyActive = true;
        mutationPulse = 1;
        window.dispatchEvent(new CustomEvent("noinputmaze:anomaly"));
    }

    function checkSignalNodes() {
        signalNodes.forEach(node => {
            if (node.collected || Math.hypot(node.x - mazePlayer.x, node.y - mazePlayer.y) > 0.42) return;
            node.collected = true;
            mazeWorld.signalsCollected += 1;
            addScar(node.x, node.y, "signal");
            scheduleMutation(450);
            refreshEncounterDirector();
            window.dispatchEvent(new CustomEvent("noinputmaze:signal", {
                detail: {
                    index: node.index,
                    count: mazeWorld.signalsCollected,
                    total: mazeWorld.signalTotal,
                    exitReady: exitIsReady()
                }
            }));
        });
    }

    function updateBloodOrb() {
        if (document.body.dataset.entered !== "true") return;
        if (bloodOrb) {
            if (Math.hypot(bloodOrb.x - mazePlayer.x, bloodOrb.y - mazePlayer.y) < 0.4) {
                mazeWorld.health = Math.min(mazeWorld.maxHealth, mazeWorld.health + 1);
                bloodOrb = null;
                nextBloodOrbRoll = p.millis() + p.random(15000, 26000);
                window.dispatchEvent(new CustomEvent("noinputmaze:heal", {
                    detail: { health: mazeWorld.health, maxHealth: mazeWorld.maxHealth }
                }));
            }
            return;
        }

        if (mazeWorld.health >= mazeWorld.maxHealth || p.millis() < nextBloodOrbRoll) return;
        nextBloodOrbRoll = p.millis() + p.random(15000, 26000);
        if (p.random() >= 0.4) return;

        const blockedCells = new Set(signalNodes.filter(node => !node.collected)
            .map(node => `${Math.floor(node.x)},${Math.floor(node.y)}`));
        blockedCells.add(`${Math.floor(MAZE_EXIT_POSITION[0])},${Math.floor(MAZE_EXIT_POSITION[1])}`);
        const candidates = MAZE_ENEMY_CELLS.map(([cellX, cellY]) => ({
            x: cellX + 0.5,
            y: cellY + 0.5
        })).filter(candidate => {
            const distance = Math.hypot(candidate.x - mazePlayer.x, candidate.y - mazePlayer.y);
            return !mazeIsWall(candidate.x, candidate.y)
                && distance > 2.3
                && distance < 9
                && !mazePointIsVisible(candidate.x, candidate.y)
                && !blockedCells.has(`${Math.floor(candidate.x)},${Math.floor(candidate.y)}`);
        });
        if (candidates.length) bloodOrb = p.random(candidates);
    }

    function finishMaze(result) {
        if (mazeWorld.ended) return;
        mazeWorld.ended = result;
        mazeKeys.clear();
        mazePendingMouseX = 0;
        if (document.pointerLockElement) document.exitPointerLock();
        window.dispatchEvent(new CustomEvent(`noinputmaze:${result}`));
    }

    function checkMazeEnding() {
        if (mazeWorld.health <= 0) {
            if (damageEncounterAt !== null && p.millis() - damageEncounterAt >= 1000) finishMaze("dead");
            return;
        }
        if (exitIsReady()
            && Math.hypot(mazePlayer.x - MAZE_EXIT_POSITION[0], mazePlayer.y - MAZE_EXIT_POSITION[1]) < 0.44) {
            finishMaze("won");
        }
    }

    function projectWorldObject(x, y, depths, raySpacing, horizon, sizeScale = 0.36) {
        const dx = x - mazePlayer.x;
        const dy = y - mazePlayer.y;
        const distance = Math.hypot(dx, dy);
        const angle = normalizeMazeAngle(Math.atan2(dy, dx) - mazePlayer.angle);
        if (Math.abs(angle) > mazePlayer.fov * 0.68 || distance < 0.14) return null;

        const depth = distance * Math.cos(angle);
        if (depth <= 0) return null;
        const centerX = (angle / mazePlayer.fov + 0.5) * p.width;
        const size = p.constrain(p.height * sizeScale / depth, 10, p.height * 0.68);
        const centerY = horizon + size * 0.08;
        const left = Math.floor((centerX - size * 0.62) / raySpacing);
        const right = Math.ceil((centerX + size * 0.62) / raySpacing);
        const visibleColumns = [];
        for (let column = left; column <= right; column += 1) {
            if (column >= 0 && column < depths.length && depth < depths[column] + 0.05) visibleColumns.push(column);
        }
        const totalColumns = Math.max(1, right - left + 1);
        return { centerX, centerY, size, depth, visibleColumns, visibleRatio: visibleColumns.length / totalColumns };
    }

    function withDepthClip(projection, raySpacing, draw) {
        if (!projection || !projection.visibleColumns.length) return;
        const context = p.drawingContext;
        context.save();
        context.beginPath();
        projection.visibleColumns.forEach(column => context.rect(column * raySpacing, 0, raySpacing + 1, p.height));
        context.clip();
        draw();
        context.restore();
    }

    function drawOrbEnemy(projection, dissolve, jitter) {
        p.rotate(p.frameCount * 0.012 + enemy.seed);
        p.noFill();
        for (let ring = 0; ring < 9; ring += 1) {
            const radius = projection.size * (0.18 + ring * 0.027) * jitter;
            p.stroke(255, (88 + ring * 14) * dissolve);
            p.strokeWeight(ring % 3 === 0 ? 1.8 : 1.05);
            p.beginShape();
            for (let point = 0; point <= 24; point += 1) {
                const theta = point / 24 * p.TWO_PI;
                const noiseValue = p.noise(enemy.seed + Math.cos(theta) * 1.7, enemy.seed + Math.sin(theta) * 1.7, p.frameCount * 0.035 + ring * 0.1);
                const radiusWarp = radius * p.map(noiseValue, 0, 1, 0.48, 1.58);
                p.vertex(Math.cos(theta) * radiusWarp, Math.sin(theta) * radiusWarp);
            }
            p.endShape();
        }
    }

    function drawCrawlerEnemy(projection, dissolve, jitter) {
        p.translate(0, projection.size * 0.32);
        p.stroke(255, 225 * dissolve);
        p.noFill();
        for (let limb = 0; limb < 11; limb += 1) {
            const side = limb % 2 === 0 ? -1 : 1;
            const y = p.map(limb, 0, 10, -projection.size * 0.16, projection.size * 0.18);
            p.beginShape();
            p.vertex(0, y);
            p.vertex(side * projection.size * p.random(0.16, 0.32) * jitter, y + p.random(-8, 8));
            p.vertex(side * projection.size * p.random(0.34, 0.54) * jitter, y + projection.size * p.random(0.12, 0.32));
            p.endShape();
        }
        for (let line = 0; line < 38; line += 1) {
            p.stroke(255, p.random(105, 245) * dissolve);
            p.line(p.random(-0.25, 0.25) * projection.size, p.random(-0.2, 0.2) * projection.size,
                p.random(-0.3, 0.3) * projection.size, p.random(-0.22, 0.22) * projection.size);
        }
    }

    function drawWatcherEnemy(projection, dissolve, jitter) {
        p.translate(0, -projection.size * 0.14);
        p.noFill();
        for (let shell = 0; shell < 10; shell += 1) {
            const width = projection.size * (0.07 + shell * 0.009) * jitter;
            const height = projection.size * (0.55 + shell * 0.018) * jitter;
            p.stroke(255, (82 + shell * 15) * dissolve);
            p.strokeWeight(shell % 3 === 0 ? 1.7 : 1);
            p.ellipse(p.random(-2, 2), p.random(-2, 2), width, height);
        }
        p.stroke(255, 210 * dissolve);
        p.line(0, -projection.size * 0.52, 0, projection.size * 0.5);
        p.noStroke();
        p.fill(0, 220 * dissolve);
        p.ellipse(0, -projection.size * 0.22, projection.size * 0.07, projection.size * 0.13);
        p.noFill();
    }

    function drawEnemy(projection, raySpacing) {
        const ageSinceSeen = enemy.seenAt === null ? 0 : p.millis() - enemy.seenAt;
        const dissolve = p.constrain(1 - Math.max(0, ageSinceSeen - 1800) / 950, 0, 1);
        const jitter = enemy.seenAt === null ? 1 : 1 + ageSinceSeen / 2000;

        withDepthClip(projection, raySpacing, () => {
            p.push();
            p.translate(projection.centerX, projection.centerY + Math.sin(p.frameCount * 0.045 + enemy.seed) * projection.size * 0.04);
            p.noStroke();
            p.fill(255, 26 * dissolve);
            if (enemy.type === "watcher") p.ellipse(0, -projection.size * 0.12, projection.size * 0.16, projection.size * 0.9);
            else if (enemy.type === "crawler") p.ellipse(0, projection.size * 0.28, projection.size * 0.72, projection.size * 0.34);
            else p.circle(0, 0, projection.size * 0.72);
            p.noFill();
            if (enemy.type === "crawler") drawCrawlerEnemy(projection, dissolve, jitter);
            else if (enemy.type === "watcher") drawWatcherEnemy(projection, dissolve, jitter);
            else drawOrbEnemy(projection, dissolve, jitter);

            p.strokeWeight(1.25);
            for (let speck = 0; speck < 96; speck += 1) {
                const theta = p.random(p.TWO_PI);
                const radius = Math.sqrt(p.random()) * projection.size * 0.48 * jitter;
                const x = Math.cos(theta) * radius;
                const y = Math.sin(theta) * radius;
                p.stroke(255, p.random(90, 255) * dissolve);
                if (p.random() < 0.3) p.line(x, y, x + p.random(-6, 6) * jitter, y + p.random(-3, 3) * jitter);
                else p.point(x, y);
            }
            p.pop();
        });
    }

    function drawSignalNodes(depths, raySpacing, horizon) {
        signalNodes.filter(node => !node.collected).forEach(node => {
            if (Math.hypot(node.x - mazePlayer.x, node.y - mazePlayer.y) > 3.4) return;
            const projection = projectWorldObject(node.x, node.y, depths, raySpacing, horizon, 0.14);
            if (!projection || projection.visibleRatio < 0.05) return;
            withDepthClip(projection, raySpacing, () => {
                p.push();
                p.translate(projection.centerX, projection.centerY);
                p.rotate(p.frameCount * 0.018 + node.index);
                p.noFill();
                for (let shell = 0; shell < 3; shell += 1) {
                    p.stroke(255, 230, 0, 210 - shell * 42);
                    p.strokeWeight(shell === 0 ? 1.4 : 0.7);
                    const radius = projection.size * (0.18 + shell * 0.075);
                    p.quad(0, -radius, radius, 0, 0, radius, -radius, 0);
                }
                p.stroke(255, 230, 0, 210);
                p.line(-projection.size * 0.48, 0, projection.size * 0.48, 0);
                p.line(0, -projection.size * 0.48, 0, projection.size * 0.48);
                p.pop();
            });
        });
    }

    function drawBloodOrb(depths, raySpacing, horizon) {
        if (!bloodOrb) return;
        const projection = projectWorldObject(bloodOrb.x, bloodOrb.y, depths, raySpacing, horizon, 0.145);
        if (!projection || projection.visibleRatio < 0.05) return;

        withDepthClip(projection, raySpacing, () => {
            p.push();
            p.translate(projection.centerX, projection.centerY);
            p.noStroke();
            p.fill(125, 0, 0, 105);
            p.circle(0, 0, projection.size * 0.52);
            p.noFill();
            for (let ring = 0; ring < 5; ring += 1) {
                p.stroke(255, 35 + ring * 8, 35 + ring * 5, 235 - ring * 33);
                p.strokeWeight(ring === 0 ? 2 : 0.9);
                const radius = projection.size * (0.22 + ring * 0.055)
                    * (1 + Math.sin(p.frameCount * 0.045 + ring) * 0.06);
                p.circle(0, 0, radius);
            }
            p.pop();
        });
    }

    function drawExitDoor(depths, raySpacing, horizon) {
        if (!exitIsReady()) return;
        const projection = projectWorldObject(
            MAZE_EXIT_POSITION[0], MAZE_EXIT_POSITION[1], depths, raySpacing, horizon, 0.31
        );
        if (!projection || projection.visibleRatio < 0.04) return;

        withDepthClip(projection, raySpacing, () => {
            p.push();
            p.translate(projection.centerX, projection.centerY - projection.size * 0.1);
            p.rectMode(p.CENTER);
            p.noFill();
            for (let frame = 0; frame < 4; frame += 1) {
                const inset = frame * projection.size * 0.045;
                p.stroke(218, 170, 34, 235 - frame * 42);
                p.strokeWeight(frame === 0 ? 2 : 0.8);
                p.rect(0, 0, projection.size * 0.62 - inset, projection.size * 1.05 - inset);
            }
            p.stroke(255, 214, 76, 220);
            p.line(0, -projection.size * 0.5, 0, projection.size * 0.5);
            p.fill(255, 214, 76, 240);
            p.noStroke();
            p.circle(projection.size * 0.19, projection.size * 0.04, Math.max(2, projection.size * 0.035));
            p.rectMode(p.CORNER);
            p.pop();
        });
    }

    function drawScars(depths, raySpacing, horizon) {
        scars.forEach(scar => {
            const projection = projectWorldObject(scar.x, scar.y, depths, raySpacing, horizon, 0.1);
            if (!projection || projection.visibleRatio < 0.04) return;
            withDepthClip(projection, raySpacing, () => {
                p.push();
                p.translate(projection.centerX, projection.centerY + projection.size * 0.3);
                p.rotate(scar.seed);
                p.noFill();
                const alpha = scar.type === "signal" ? 190 : 75;
                p.stroke(255, alpha);
                for (let slash = 0; slash < 6; slash += 1) {
                    const radius = projection.size * (0.12 + slash * 0.045);
                    p.arc(0, 0, radius, radius * 0.55, slash * 0.7, slash * 0.7 + p.PI * 1.2);
                }
                p.pop();
            });
        });
    }

    function updateAndDrawEnemy(depths, raySpacing, horizon) {
        if (document.body.dataset.entered !== "true") return;
        if (gameStartedAt === null || p.millis() - gameStartedAt < 20000) return;
        if (!enemy && p.millis() >= nextEnemySpawn) spawnHiddenEnemy();
        if (!enemy) return;
        if (enemy.seenAt !== null && p.millis() - enemy.seenAt > 2800) {
            enemy = null;
            nextEnemySpawn = p.millis() + p.random(2600, 5400);
            return;
        }
        const projection = projectWorldObject(enemy.x, enemy.y, depths, raySpacing, horizon,
            enemy.type === "watcher" ? 0.54 : 0.46);
        const revealThreshold = enemy.seenAt === null ? 0.24 : 0.05;
        if (!projection || projection.visibleRatio < revealThreshold) return;

        if (enemy.seenAt === null) {
            const exitWasReady = exitIsReady();
            enemy.seenAt = p.millis();
            mazeWorld.health = Math.max(0, mazeWorld.health - 1);
            mazeWorld.encounterCount += 1;
            damageEncounterAt = p.millis();
            addScar(enemy.x, enemy.y, enemy.type);
            addScar(mazePlayer.x, mazePlayer.y, "afterimage");
            scheduleMutation();
            encounterPulse = 1;
            window.dispatchEvent(new CustomEvent("noinputmaze:enemyseen", {
                detail: { type: enemy.type, x: enemy.x, y: enemy.y }
            }));
            window.dispatchEvent(new CustomEvent("noinputmaze:damage", {
                detail: { health: mazeWorld.health, maxHealth: mazeWorld.maxHealth }
            }));
            refreshEncounterDirector();
            if (!exitWasReady && exitIsReady()) {
                window.dispatchEvent(new CustomEvent("noinputmaze:exitopen"));
            }
        }

        drawEnemy(projection, raySpacing);
    }

    function drawDeadScreen() {
        p.background(3, 0, 0);
        p.randomSeed(9137);
        p.noStroke();
        for (let splatter = 0; splatter < 80; splatter += 1) {
            const cluster = splatter % 4;
            const originX = [0.14, 0.79, 0.34, 0.9][cluster] * p.width;
            const originY = [0.18, 0.27, 0.84, 0.72][cluster] * p.height;
            const radius = p.random(2, Math.min(34, p.height * 0.045));
            p.fill(p.random(75, 142), 0, 0, p.random(95, 225));
            p.ellipse(originX + p.randomGaussian() * p.width * 0.09,
                originY + p.randomGaussian() * p.height * 0.08, radius * p.random(0.4, 1.8), radius);
        }
        p.stroke(105, 0, 0, 190);
        p.strokeWeight(2);
        for (let drip = 0; drip < 16; drip += 1) {
            const x = p.random(p.width);
            const y = p.random(p.height * 0.72);
            p.line(x, y, x + p.random(-4, 4), y + p.random(25, 150));
        }
        p.noStroke();
        p.fill(230, 225, 218);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(p.width < 600 ? 48 : 68);
        p.text("DEAD", p.width / 2, p.height / 2);
    }

    function drawWonScreen() {
        p.background(190, 145, 18);
        p.push();
        p.translate(p.width / 2, p.height / 2);
        p.rotate(p.frameCount * 0.0015);
        p.stroke(22, 16, 0, 110);
        p.strokeWeight(1);
        for (let ray = 0; ray < 48; ray += 1) {
            const angle = ray / 48 * p.TWO_PI;
            const inner = Math.min(p.width, p.height) * 0.14;
            const outer = Math.hypot(p.width, p.height);
            p.line(Math.cos(angle) * inner, Math.sin(angle) * inner,
                Math.cos(angle) * outer, Math.sin(angle) * outer);
        }
        p.pop();
        p.noStroke();
        p.fill(8, 6, 0);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(p.width < 600 ? 48 : 68);
        p.text("WON", p.width / 2, p.height / 2);
    }

    function drawEndScreen() {
        if (mazeWorld.ended === "dead") drawDeadScreen();
        if (mazeWorld.ended === "won") drawWonScreen();
    }

    function drawArchitecture(horizon, raySpacing) {
        const rayCount = Math.ceil(p.width / raySpacing) + 1;
        const tops = [];
        const bottoms = [];
        const rays = [];
        const depths = [];
        const pitch = audioValue("pitch");
        const feedback = audioValue("feedback");
        const delay = audioValue("delayMS");
        const chaos = audioValue("chaos");
        const drive = audioValue("drive");
        const intensity = audioValue("intensity");
        const verticalScale = 0.9 + pitch * 0.42;

        p.stroke(255, 20 + intensity * 36);
        p.strokeWeight(0.7 + drive * 0.65);
        p.line(0, horizon, p.width, horizon);

        for (let i = 0; i < rayCount; i += 1) {
            const screenRatio = i / (rayCount - 1);
            const angle = mazePlayer.angle - mazePlayer.fov / 2 + screenRatio * mazePlayer.fov;
            const ray = castMazeRay(angle);
            const correctedDistance = ray.distance * Math.cos(angle - mazePlayer.angle);
            const wallHeight = Math.min(p.height * 1.9, p.height * 0.78 * verticalScale / correctedDistance);
            const chaosJitter = Math.sin(i * 0.73 + p.frameCount * 0.08) * chaos * 3.2;
            const top = horizon - wallHeight / 2 + chaosJitter;
            const bottom = horizon + wallHeight / 2 - chaosJitter;
            const x = screenRatio * p.width;
            tops.push({ x, y: top });
            bottoms.push({ x, y: bottom });
            rays.push(ray);
            depths.push(correctedDistance);

            const depthAlpha = p.map(correctedDistance, 0.3, 12, 230, 24, true);
            const edgePulse = Math.min(ray.wallOffset, 1 - ray.wallOffset) < 0.035 + chaos * 0.018;
            p.stroke(255, edgePulse ? Math.min(255, depthAlpha + 70) : depthAlpha * (0.28 + feedback * 0.25));
            p.strokeWeight((edgePulse ? 1.3 : 0.55) + drive * 0.55);
            p.line(x, top, x, bottom);
        }

        p.stroke(255, 190 + intensity * 60);
        p.strokeWeight(0.9 + drive * 0.75);
        p.beginShape();
        tops.forEach(point => p.vertex(point.x, point.y));
        p.endShape();
        p.beginShape();
        bottoms.forEach(point => p.vertex(point.x, point.y));
        p.endShape();

        const echoCount = Math.min(3, Math.floor(delay * 3 + mazeWorld.signalsCollected * 0.25));
        for (let echo = 1; echo <= echoCount; echo += 1) {
            const offset = echo * (3 + delay * 10) * Math.sin(p.frameCount * 0.006 + echo);
            p.stroke(255, 22 + feedback * 30);
            p.beginShape();
            tops.forEach(point => p.vertex(point.x + offset, point.y - offset * 0.22));
            p.endShape();
            p.beginShape();
            bottoms.forEach(point => p.vertex(point.x - offset, point.y + offset * 0.22));
            p.endShape();
        }

        p.stroke(255, 34 + feedback * 42);
        p.strokeWeight(0.65);
        for (let i = 0; i < rays.length; i += 1) {
            if (rays[i].wallOffset < 0.045 || rays[i].wallOffset > 0.955) {
                p.line(tops[i].x, tops[i].y, p.width / 2, horizon);
                p.line(bottoms[i].x, bottoms[i].y, p.width / 2, horizon);
            }
        }

        p.stroke(255, 18 + intensity * 25);
        for (let layer = 1; layer <= 8; layer += 1) {
            const curve = (layer / 8) ** 2;
            const spatialError = mazeWorld.anomalyActive ? Math.sin(layer * 4 + p.frameCount * 0.014) * 5 : 0;
            p.line(0, p.lerp(horizon, 0, curve) + spatialError, p.width, p.lerp(horizon, 0, curve) - spatialError);
            p.line(0, p.lerp(horizon, p.height, curve) - spatialError, p.width, p.lerp(horizon, p.height, curve) + spatialError);
        }
        return { depths, tops, bottoms };
    }

    p.setup = () => {
        const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
        canvas.parent("maze-canvas");
        mazeCanvas = canvas.elt;
        mazeCanvas.addEventListener("click", () => {
            if (document.body.dataset.entered === "true" && !document.pointerLockElement) captureMazePointer();
        });
        window.addEventListener("noinputmaze:entered", () => {
            captureMazePointer();
            if (gameStartedAt === null) {
                gameStartedAt = p.millis();
                nextEnemySpawn = gameStartedAt + 20000;
                nextBloodOrbRoll = gameStartedAt + 9000;
            }
        });
        p.pixelDensity(1);
        p.frameRate(60);
        p.textFont("Courier New");
        p.noFill();
        buildGrain();
    };

    p.draw = () => {
        const deltaSeconds = Math.min(p.deltaTime / 1000, 0.05);
        checkMazeEnding();
        if (mazeWorld.ended) {
            drawEndScreen();
            return;
        }
        updateMazeLook(deltaSeconds);
        updateMazePlayer(deltaSeconds);
        checkDeadEndEntry();
        checkSignalNodes();
        updateBloodOrb();
        checkPortalTraversal();
        checkMutation();
        checkMazeEnding();
        if (mazeWorld.ended) {
            drawEndScreen();
            return;
        }

        const chaos = audioValue("chaos");
        const intensity = audioValue("intensity");
        const noise = audioValue("noiseInjection");
        const dryWet = audioValue("dryWet");
        const pulse = Math.sin(p.frameCount * (0.012 + intensity * 0.035));
        const horizon = p.height * 0.5
            + pulse * p.height * (0.008 + intensity * 0.012)
            + (p.noise(p.frameCount * 0.02) - 0.5) * chaos * 12;
        const raySpacing = p.width < 700 ? 5 : 7;

        p.background(0);
        const architecture = drawArchitecture(horizon, raySpacing);
        drawScars(architecture.depths, raySpacing, horizon);
        drawSignalNodes(architecture.depths, raySpacing, horizon);
        drawBloodOrb(architecture.depths, raySpacing, horizon);
        drawExitDoor(architecture.depths, raySpacing, horizon);
        updateAndDrawEnemy(architecture.depths, raySpacing, horizon);

        if (dryWet > 0.12 || mazeWorld.anomalyActive) {
            p.stroke(255, 12 + dryWet * 34);
            p.strokeWeight(0.6);
            const ghostCount = 2 + Math.floor(dryWet * 5);
            for (let ghost = 0; ghost < ghostCount; ghost += 1) {
                const shift = Math.sin(p.frameCount * 0.008 + ghost * 2.1) * p.width * (0.01 + dryWet * 0.025);
                p.line(p.width / 2 + shift, horizon, ghost % 2 ? 0 : p.width, ghost % 2 ? 0 : p.height);
            }
        }

        p.push();
        p.tint(255, 38 + noise * 115 + mutationPulse * 45);
        p.image(grain, 0, 0, p.width, p.height);
        p.pop();

        if (mutationPulse > 0.01) {
            p.noFill();
            p.stroke(255, mutationPulse * 90);
            p.strokeWeight(1);
            const inset = (1 - mutationPulse) * p.width * 0.12;
            p.rect(inset, inset, p.width - inset * 2, p.height - inset * 2);
        }

        if (encounterPulse > 0.01) {
            p.stroke(255, encounterPulse * 145);
            p.strokeWeight(1);
            for (let tear = 0; tear < 7; tear += 1) {
                const y = p.random(p.height);
                p.line(0, y, p.width * p.random(0.15, 0.72), y + p.random(-5, 5));
            }
            encounterPulse *= 0.78;
        }

        p.noStroke();
        for (let edge = 0; edge < 90; edge += 3) {
            p.fill(0, p.map(edge, 0, 90, 16, 0));
            p.rect(edge, edge, p.width - edge * 2, p.height - edge * 2);
        }


        if (damageEncounterAt !== null) {
            const damageAge = p.millis() - damageEncounterAt;
            if (damageAge >= 1000 && damageAge < 15000) {
                const visibleAge = damageAge - 1000;
                const fadeIn = Math.min(1, visibleAge / 160);
                const fadeOut = 1 - Math.max(0, visibleAge - 160) / 13840;
                const damageStrength = fadeIn * Math.max(0, fadeOut);
                p.noStroke();
                p.fill(82, 0, 0, damageStrength * 175);
                p.rect(0, 0, p.width, p.height);
            } else if (damageAge >= 15000) damageEncounterAt = null;
        }
        if (p.frameCount % 30 === 0) document.body.dataset.fps = Math.round(p.frameRate());
        p.noFill();
    };

    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        buildGrain();
    };
}, "maze-canvas");
