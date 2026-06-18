const canvas = document.getElementById("visuals");
const ctx = canvas.getContext("2d", { alpha: false });
const gate = document.getElementById("gate");
const meter = document.getElementById("meter");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const marks = ["\u0300", "\u0301", "\u0302", "\u0304", "\u0307", "\u0308", "\u0311", "\u0315", "\u0316", "\u0320", "\u0324", "\u0325", "\u0334", "\u0335", "\u034f", "\u035c", "\u0362"];
const fallbackPhrases = [
    "THE SIGNAL HAS TEETH",
    "ERROR IS A RHYTHM",
    "THE CLOCK REFUSES",
    "KNOWLEDGE ARRIVES DAMAGED",
    "NO CARRIER / NO MERCY"
];
const wikipediaEndpoint = "https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&grnlimit=8&prop=extracts&exintro=1&explaintext=1&exchars=420&format=json&origin=*";
const colors = ["#f2f2ed", "#a6a6a0", "#dfff00", "#ff4b33"];

let width = 1;
let height = 1;
let ratio = 1;
let started = false;
let pointerX = 0.5;
let pointerY = 0.5;
let energy = 0;
let rupture = 0;
let frameTime = 0;
let phraseChangedAt = 0;
let activePhrase = fallbackPhrases[0];
let activeLines = [];
let loadingWikipedia = false;
let geometrySeed = Math.random() * 10000;
const wikipediaPhrases = [];
const geometry = [];

const staticCanvas = document.createElement("canvas");
const staticCtx = staticCanvas.getContext("2d", { alpha: false });
staticCanvas.width = 96;
staticCanvas.height = 54;
const staticImage = staticCtx.createImageData(staticCanvas.width, staticCanvas.height);
const knowledgeCanvas = document.createElement("canvas");
const knowledgeCtx = knowledgeCanvas.getContext("2d");
knowledgeCanvas.width = 1800;
knowledgeCanvas.height = 520;

function zalgo(text, amount = 2) {
    return Array.from(text).map((letter) => {
        if (letter === " ") return letter;
        let result = letter;
        const count = Math.max(1, Math.floor(amount + Math.random() * amount));
        for (let i = 0; i < count; i += 1) {
            result += marks[Math.floor(Math.random() * marks.length)];
        }
        return result;
    }).join("");
}

function compactFact(title, extract) {
    const cleanTitle = title.replace(/\s+/g, " ").trim();
    const cleanExtract = extract.replace(/\s+/g, " ").trim();
    if (!cleanTitle || !cleanExtract) return null;
    const sentence = cleanExtract.match(/^.*?[.!?](?:\s|$)/)?.[0] || cleanExtract;
    const fact = `${cleanTitle} // ${sentence}`.replace(/\s+/g, " ").trim();
    const clipped = fact.length > 180 ? `${fact.slice(0, 176).replace(/\s+\S*$/, "")}...` : fact;
    return clipped.toUpperCase();
}

async function loadWikipedia() {
    if (loadingWikipedia || wikipediaPhrases.length > 5) return;
    loadingWikipedia = true;
    try {
        const response = await fetch(wikipediaEndpoint, { mode: "cors" });
        if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
        const data = await response.json();
        Object.values(data.query?.pages || {}).forEach((page) => {
            const fact = compactFact(page.title || "", page.extract || "");
            if (fact) wikipediaPhrases.push(fact);
        });
        if (wikipediaPhrases.length) document.body.dataset.feedReady = "wikipedia";
    } catch (error) {
        document.body.dataset.feedReady = "local";
        console.warn("Wikipedia feed unavailable", error);
    } finally {
        loadingWikipedia = false;
    }
}

function nextPhrase() {
    if (wikipediaPhrases.length < 4) loadWikipedia();
    if (wikipediaPhrases.length) {
        document.body.dataset.textSource = "wikipedia";
        return wikipediaPhrases.shift();
    }
    document.body.dataset.textSource = "local";
    return fallbackPhrases[Math.floor(Math.random() * fallbackPhrases.length)];
}

function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    regenerateGeometry();
    activeLines = makeKnowledgeLines(activePhrase);
    renderKnowledgeTexture();
}

function seeded(index, salt = 0) {
    const value = Math.sin(geometrySeed + index * 91.731 + salt * 17.113) * 43758.5453;
    return value - Math.floor(value);
}

function regenerateGeometry() {
    geometry.length = 0;
    const count = reducedMotion ? 12 : 20;
    for (let i = 0; i < count; i += 1) {
        geometry.push({
            x: seeded(i, 1) * width,
            y: seeded(i, 2) * height,
            radius: 30 + seeded(i, 3) * Math.min(width, height) * 0.28,
            sides: 3 + Math.floor(seeded(i, 4) * 6),
            rotation: seeded(i, 5) * Math.PI * 2,
            speed: (seeded(i, 6) - 0.5) * 0.00016,
            weight: seeded(i, 7) > 0.84 ? 5 : 1,
            color: colors[Math.floor(seeded(i, 8) * colors.length)]
        });
    }
}

class StableEngine {
    constructor() {
        this.audio = null;
        this.timer = null;
        this.nextStep = 0;
        this.step = 0;
        this.tempo = 176;
        this.nodes = {};
    }

    createNoiseBuffer() {
        const buffer = this.audio.createBuffer(1, this.audio.sampleRate * 2, this.audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    distortionCurve(amount = 24) {
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i += 1) {
            const x = i * 2 / curve.length - 1;
            curve[i] = Math.tanh(x * amount);
        }
        return curve;
    }

    async start() {
        this.audio = new (window.AudioContext || window.webkitAudioContext)();
        const input = this.audio.createGain();
        const shaper = this.audio.createWaveShaper();
        const compressor = this.audio.createDynamicsCompressor();
        const analyser = this.audio.createAnalyser();
        const master = this.audio.createGain();
        const delay = this.audio.createDelay(0.4);
        const feedback = this.audio.createGain();
        const delayReturn = this.audio.createGain();

        input.gain.value = 0.7;
        shaper.curve = this.distortionCurve();
        shaper.oversample = "2x";
        compressor.threshold.value = -16;
        compressor.ratio.value = 14;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.11;
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.7;
        master.gain.value = 0.42;
        delay.delayTime.value = 0.105;
        feedback.gain.value = 0.23;
        delayReturn.gain.value = 0.16;

        input.connect(shaper).connect(compressor).connect(analyser).connect(master).connect(this.audio.destination);
        delay.connect(feedback).connect(delay);
        delay.connect(delayReturn).connect(compressor);

        const noiseBuffer = this.createNoiseBuffer();
        const noise = this.audio.createBufferSource();
        const noiseFilter = this.audio.createBiquadFilter();
        const noiseGain = this.audio.createGain();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.value = 4200;
        noiseFilter.Q.value = 6;
        noiseGain.gain.value = 0.0001;
        noise.connect(noiseFilter).connect(noiseGain).connect(input);
        noiseGain.connect(delay);

        const kick = this.audio.createOscillator();
        const kickGain = this.audio.createGain();
        kick.type = "sine";
        kick.frequency.value = 48;
        kickGain.gain.value = 0.0001;
        kick.connect(kickGain).connect(input);

        const metal = this.audio.createOscillator();
        const metalGain = this.audio.createGain();
        const metalFilter = this.audio.createBiquadFilter();
        metal.type = "square";
        metal.frequency.value = 730;
        metalGain.gain.value = 0.0001;
        metalFilter.type = "highpass";
        metalFilter.frequency.value = 900;
        metal.connect(metalFilter).connect(metalGain).connect(input);
        metalGain.connect(delay);

        const sub = this.audio.createOscillator();
        const subGain = this.audio.createGain();
        sub.type = "triangle";
        sub.frequency.value = 37;
        subGain.gain.value = 0.025;
        sub.connect(subGain).connect(input);

        noise.start();
        kick.start();
        metal.start();
        sub.start();

        this.nodes = { analyser, delay, noise, noiseFilter, noiseGain, kick, kickGain, metal, metalGain, sub, subGain };
        this.waveform = new Uint8Array(analyser.frequencyBinCount);
        this.audio.resume().catch(() => {});
        this.nextStep = this.audio.currentTime + 0.04;
        this.timer = window.setInterval(() => this.schedule(), 35);
    }

    pulse(gain, time, peak, duration) {
        const floor = 0.0001;
        gain.cancelScheduledValues(time);
        gain.setValueAtTime(floor, time);
        gain.linearRampToValueAtTime(peak, time + 0.003);
        gain.exponentialRampToValueAtTime(floor, time + duration);
    }

    programStep(time) {
        const density = 0.18 + pointerX * 0.7;
        const violence = 0.16 + pointerY * 0.84;
        if (this.step % 8 === 0) {
            this.nodes.kick.frequency.setValueAtTime(120, time);
            this.nodes.kick.frequency.exponentialRampToValueAtTime(42, time + 0.1);
            this.pulse(this.nodes.kickGain.gain, time, 0.32, 0.14);
            energy = Math.min(1.4, energy + 0.55);
        }
        if (Math.random() < 0.24 + density * 0.5) {
            this.nodes.noiseFilter.frequency.setTargetAtTime(600 + Math.random() * (3000 + violence * 9000), time, 0.006);
            this.nodes.noiseFilter.Q.setTargetAtTime(2 + Math.random() * 16, time, 0.008);
            this.pulse(this.nodes.noiseGain.gain, time, 0.06 + violence * 0.12, 0.018 + Math.random() * 0.07);
            energy = Math.min(1.4, energy + 0.22);
        }
        if (Math.random() < density * 0.28) {
            this.nodes.metal.frequency.setTargetAtTime(180 + Math.random() * 2300, time, 0.004);
            this.pulse(this.nodes.metalGain.gain, time, 0.025 + violence * 0.055, 0.025 + Math.random() * 0.06);
            energy = Math.min(1.4, energy + 0.18);
        }
        this.step += 1;
        if (this.step % 32 === 0) {
            this.tempo = Math.round(150 + Math.random() * 62);
            this.nodes.delay.delayTime.setTargetAtTime(0.045 + Math.random() * 0.14, time, 0.04);
        }
    }

    schedule() {
        if (!this.audio || this.audio.state !== "running") return;
        const now = this.audio.currentTime;
        if (this.nextStep < now - 0.15) this.nextStep = now + 0.02;
        let scheduled = 0;
        while (this.nextStep < now + 0.09 && scheduled < 3) {
            this.programStep(this.nextStep);
            this.nextStep += 60 / this.tempo / 4;
            scheduled += 1;
        }
        meter.textContent = `${this.tempo} BPM / FIELD ${Math.round((pointerX + pointerY) * 50)}`;
    }

    surge() {
        if (!this.audio) return;
        const now = this.audio.currentTime + 0.01;
        this.pulse(this.nodes.noiseGain.gain, now, 0.24, 0.32);
        this.pulse(this.nodes.metalGain.gain, now, 0.1, 0.18);
        this.nodes.noiseFilter.frequency.setTargetAtTime(11000, now, 0.008);
        rupture = 1;
        energy = 1.4;
    }

    amplitude() {
        if (!this.nodes.analyser) return 0;
        this.nodes.analyser.getByteTimeDomainData(this.waveform);
        let total = 0;
        for (let i = 0; i < this.waveform.length; i += 1) total += Math.abs(this.waveform[i] - 128);
        return Math.min(1, total / this.waveform.length / 32);
    }
}

const engine = new StableEngine();

function drawStatic(frame) {
    if (frame % 3 === 0) {
        const data = staticImage.data;
        for (let i = 0; i < data.length; i += 4) {
            const value = Math.random() > 0.53 ? 255 : Math.floor(Math.random() * 70);
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
        staticCtx.putImageData(staticImage, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = 0.055 + energy * 0.075;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staticCanvas, 0, 0, width, height);
    ctx.restore();
}

function drawGrid(now, amplitude) {
    const horizon = height * (0.36 + (pointerY - 0.5) * 0.1);
    const warp = (pointerX - 0.5) * width * 0.35;
    ctx.strokeStyle = `rgba(242,242,237,${0.08 + amplitude * 0.18})`;
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 1) {
        ctx.beginPath();
        ctx.moveTo(width * 0.5 + warp + i * 7, horizon);
        ctx.lineTo(width * 0.5 + i * width * 0.16, height);
        ctx.stroke();
    }
    for (let i = 0; i < 12; i += 1) {
        const progress = i / 11;
        const eased = progress * progress;
        const y = horizon + eased * (height - horizon);
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(now * 0.001 + i) * amplitude * 14);
        ctx.lineTo(width, y - Math.sin(now * 0.001 + i) * amplitude * 14);
        ctx.stroke();
    }
}

function drawGeometry(now, amplitude) {
    const bendX = (pointerX - 0.5) * 90;
    const bendY = (pointerY - 0.5) * 90;
    geometry.forEach((shape, index) => {
        const rotation = shape.rotation + now * shape.speed;
        const pulse = 1 + Math.sin(now * 0.0007 + index * 1.7) * (0.06 + amplitude * 0.18);
        const x = shape.x + Math.sin(now * 0.0003 + index) * bendX;
        const y = shape.y + Math.cos(now * 0.00024 + index * 0.7) * bendY;
        ctx.beginPath();
        for (let side = 0; side <= shape.sides; side += 1) {
            const angle = rotation + side / shape.sides * Math.PI * 2;
            const distortion = 1 + Math.sin(side * 7 + geometrySeed) * amplitude * 0.26;
            const px = x + Math.cos(angle) * shape.radius * pulse * distortion;
            const py = y + Math.sin(angle) * shape.radius * pulse / (1.25 + pointerY * 0.8);
            if (side === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = shape.color;
        ctx.globalAlpha = 0.12 + (index % 5) * 0.055 + amplitude * 0.2;
        ctx.lineWidth = shape.weight + amplitude * 2;
        ctx.stroke();
        if (index % 4 === 0) {
            ctx.lineTo(width * 0.5 + bendX, height * 0.5 + bendY);
            ctx.stroke();
        }
    });
    ctx.globalAlpha = 1;
}

function wrapLines(text, maxLength = 50) {
    const words = text.split(" ");
    const lines = [""];
    words.forEach((word) => {
        const current = lines[lines.length - 1];
        if (`${current} ${word}`.trim().length > maxLength && lines.length < 4) lines.push(word);
        else lines[lines.length - 1] = `${current} ${word}`.trim();
    });
    return lines;
}

function makeKnowledgeLines(text) {
    const maxLength = width < 700 ? 27 : 48;
    return wrapLines(text, maxLength).map((line) => zalgo(line, 2));
}

function setActivePhrase(text) {
    activePhrase = text;
    activeLines = makeKnowledgeLines(text);
    renderKnowledgeTexture();
}

function renderKnowledgeTexture() {
    knowledgeCtx.clearRect(0, 0, knowledgeCanvas.width, knowledgeCanvas.height);
    const fontSize = width < 700 ? 38 : 54;
    knowledgeCtx.font = `700 ${fontSize}px "Courier New", monospace`;
    knowledgeCtx.textAlign = "left";
    knowledgeCtx.textBaseline = "top";
    activeLines.forEach((line, index) => {
        knowledgeCtx.fillStyle = index === 0 ? "#dfff00" : "#f2f2ed";
        knowledgeCtx.globalAlpha = 0.88;
        knowledgeCtx.fillText(line, 20, 20 + index * fontSize * 1.3, 1740);
    });
    knowledgeCtx.globalAlpha = 1;
}

function drawKnowledge(now, amplitude) {
    if (now - phraseChangedAt > 5200) {
        setActivePhrase(nextPhrase());
        phraseChangedAt = now;
        geometrySeed = Math.random() * 10000;
        regenerateGeometry();
    }
    const x = width * (0.11 + pointerX * 0.08);
    const y = height * (0.19 + pointerY * 0.11);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.035 + (pointerX - 0.5) * 0.05);
    const scale = Math.min(width * 0.78 / knowledgeCanvas.width, width < 700 ? 0.4 : 0.72);
    ctx.globalAlpha = 0.84;
    ctx.drawImage(knowledgeCanvas, Math.sin(now * 0.002) * amplitude * 12, 0, knowledgeCanvas.width * scale, knowledgeCanvas.height * scale);
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.font = "10px Courier New, monospace";
    ctx.fillStyle = "#a6a6a0";
    for (let i = 0; i < 8; i += 1) {
        const gx = seeded(i, 30) * width;
        const gy = seeded(i, 31) * height;
        ctx.fillText(`${Math.floor(seeded(i, 32) * 9999).toString().padStart(4, "0")} / NULL`, gx, gy);
    }
}

let frame = 0;
function render(now) {
    const interval = 1000 / (reducedMotion ? 16 : 24);
    if (now - frameTime >= interval) {
        frameTime = now;
        frame += 1;
        const amplitude = Math.max(engine.amplitude(), energy * 0.45);
        energy *= 0.9;
        rupture *= 0.84;
        ctx.fillStyle = rupture > 0.45 ? "#141414" : "#000";
        ctx.fillRect(0, 0, width, height);
        drawGrid(now, amplitude);
        drawGeometry(now, amplitude);
        drawKnowledge(now, amplitude);
        drawStatic(frame);

        if (rupture > 0.08) {
            ctx.strokeStyle = "#ff4b33";
            ctx.lineWidth = 2 + rupture * 12;
            for (let i = 0; i < 5; i += 1) {
                const y = seeded(i, frame) * height;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y + (seeded(i, frame + 1) - 0.5) * 90);
                ctx.stroke();
            }
        }
    }
    window.requestAnimationFrame(render);
}

window.addEventListener("pointermove", (event) => {
    pointerX = Math.max(0, Math.min(1, event.clientX / width));
    pointerY = Math.max(0, Math.min(1, event.clientY / height));
});

window.addEventListener("pointerdown", () => {
    if (!started) return;
    engine.surge();
    setActivePhrase(nextPhrase());
    phraseChangedAt = performance.now();
    geometrySeed = Math.random() * 10000;
    regenerateGeometry();
});

gate.addEventListener("click", async () => {
    if (started) return;
    gate.disabled = true;
    gate.querySelector("span").textContent = "TUNING CARRIER";
    try {
        await engine.start();
        started = true;
        document.body.dataset.started = "true";
        gate.classList.add("is-gone");
        rupture = 0.75;
        energy = 1;
    } catch (error) {
        gate.disabled = false;
        gate.querySelector("span").textContent = "AUDIO FAILED / RETRY";
        console.error(error);
    }
});

window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => {
    if (engine.timer) window.clearInterval(engine.timer);
    if (engine.audio) engine.audio.close().catch(() => {});
});

resize();
loadWikipedia();
window.requestAnimationFrame(render);
