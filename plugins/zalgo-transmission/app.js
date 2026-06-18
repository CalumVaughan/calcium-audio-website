const canvas = document.getElementById("visuals");
const ctx = canvas.getContext("2d", { alpha: false });
const gate = document.getElementById("gate");
const meter = document.getElementById("meter");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const marks = ["\u0300", "\u0301", "\u0302", "\u0304", "\u0307", "\u0308", "\u0311", "\u0315", "\u0316", "\u0320", "\u0324", "\u0325", "\u0334", "\u0335", "\u034f", "\u035c", "\u0362"];
const phrases = [
    "THE SIGNAL HAS TEETH",
    "NO CARRIER / NO MERCY",
    "YOU ARE INSIDE THE BUFFER",
    "ERROR IS A RHYTHM",
    "DO NOT CORRECT THE IMAGE",
    "THE CLOCK REFUSES",
    "RECEIVE RECEIVE RECEIVE"
];
const palette = ["#f5f7ef", "#00f0ff", "#ff3f9b", "#b6ff28", "#ff6b18"];
const wikipediaEndpoint = "https://en.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&grnlimit=8&prop=extracts&exintro=1&explaintext=1&exchars=360&format=json&origin=*";
const phraseCanvas = document.createElement("canvas");
const phraseCtx = phraseCanvas.getContext("2d");
phraseCanvas.width = 1800;
phraseCanvas.height = 300;

let width = 1;
let height = 1;
let pixelRatio = 1;
let started = false;
let pointerX = 0.5;
let pointerY = 0.5;
let visualEnergy = 0;
let blast = 0;
let activePhrase = phrases[0];
let activeDisplay = zalgo(activePhrase, 3);
let lastFrame = 0;
let lastPhraseChange = 0;
let loadingWikipedia = false;
const wikipediaPhrases = [];
const eventBursts = [];

function compactFact(title, extract) {
    const cleanTitle = title.replace(/\s+/g, " ").trim();
    const cleanExtract = extract.replace(/\s+/g, " ").trim();
    if (!cleanTitle || !cleanExtract) return null;
    const firstSentence = cleanExtract.match(/^.*?[.!?](?:\s|$)/)?.[0] || cleanExtract;
    const fact = `${cleanTitle}: ${firstSentence}`.replace(/\s+/g, " ").trim();
    if (fact.length <= 120) return fact.toUpperCase();
    const shortened = fact.slice(0, 117).replace(/\s+\S*$/, "");
    return `${shortened}...`.toUpperCase();
}

async function loadWikipediaPhrases() {
    if (loadingWikipedia || wikipediaPhrases.length > 6) return;
    loadingWikipedia = true;
    try {
        const response = await fetch(wikipediaEndpoint, { mode: "cors" });
        if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
        const data = await response.json();
        const pages = Object.values(data.query?.pages || {});
        pages.forEach((page) => {
            const fact = compactFact(page.title || "", page.extract || "");
            if (fact) wikipediaPhrases.push(fact);
        });
        if (wikipediaPhrases.length) document.body.dataset.feedReady = "wikipedia";
    } catch (error) {
        console.warn("Wikipedia signal unavailable; using local transmission", error);
    } finally {
        loadingWikipedia = false;
    }
}

function nextPhrase() {
    if (wikipediaPhrases.length < 4) loadWikipediaPhrases();
    if (wikipediaPhrases.length) {
        document.body.dataset.textSource = "wikipedia";
        return wikipediaPhrases.shift();
    }
    document.body.dataset.textSource = "local";
    return phrases[Math.floor(Math.random() * phrases.length)];
}

function renderPhrase() {
    phraseCtx.clearRect(0, 0, phraseCanvas.width, phraseCanvas.height);
    phraseCtx.textAlign = "center";
    phraseCtx.textBaseline = "middle";
    const words = activeDisplay.split(" ");
    const lines = [""];
    words.forEach((word) => {
        const line = lines[lines.length - 1];
        if ((line + " " + word).length > 58 && lines.length < 3) lines.push(word);
        else lines[lines.length - 1] = `${line} ${word}`.trim();
    });
    const fontSize = lines.length > 2 ? 47 : lines.length > 1 ? 60 : 82;
    phraseCtx.font = `900 ${fontSize}px Arial Black, sans-serif`;
    const lineHeight = fontSize * 1.05;
    const top = 150 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
        const y = top + index * lineHeight;
        phraseCtx.globalAlpha = 0.45;
        phraseCtx.fillStyle = "#00f0ff";
        phraseCtx.fillText(line, 892, y + 4, 1720);
        phraseCtx.fillStyle = "#ff3f9b";
        phraseCtx.fillText(line, 908, y - 4, 1720);
        phraseCtx.globalAlpha = 0.94;
        phraseCtx.fillStyle = "#f5f7ef";
        phraseCtx.fillText(line, 900, y, 1720);
    });
    phraseCtx.globalAlpha = 1;
}

function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
}

function zalgo(text, amount = 2) {
    return Array.from(text).map((letter) => {
        if (letter === " ") return letter;
        let corrupted = letter;
        const count = Math.max(1, Math.floor(amount + Math.random() * amount));
        for (let i = 0; i < count; i += 1) {
            corrupted += marks[Math.floor(Math.random() * marks.length)];
        }
        return corrupted;
    }).join("");
}

function audioEvent(type, strength = 0.5) {
    visualEnergy = Math.min(1.5, visualEnergy + strength);
    if (type === "kick") blast = Math.max(blast, strength);
    eventBursts.push({
        type,
        strength,
        born: performance.now(),
        x: width * (0.1 + Math.random() * 0.8),
        y: height * (0.1 + Math.random() * 0.8),
        color: palette[Math.floor(Math.random() * palette.length)]
    });
    if (eventBursts.length > 28) eventBursts.shift();
}

class GlitchEngine {
    constructor() {
        this.audio = null;
        this.input = null;
        this.delay = null;
        this.noiseBuffer = null;
        this.timer = null;
        this.nextStepTime = 0;
        this.step = 0;
        this.tempo = 184;
    }

    makeDistortionCurve(amount = 28) {
        const samples = 2048;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i += 1) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) /
                (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    createNoiseBuffer() {
        const buffer = this.audio.createBuffer(1, this.audio.sampleRate * 2, this.audio.sampleRate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < data.length; i += 1) {
            const white = Math.random() * 2 - 1;
            previous = previous * 0.84 + white * 0.16;
            data[i] = white * 0.72 + previous * 0.28;
        }
        return buffer;
    }

    connectVoice(node, send = 0.16) {
        node.connect(this.input);
        if (send > 0) {
            const sendGain = this.audio.createGain();
            sendGain.gain.value = send;
            node.connect(sendGain).connect(this.delay);
        }
    }

    kick(time, strength = 0.8) {
        const osc = this.audio.createOscillator();
        const gain = this.audio.createGain();
        osc.frequency.setValueAtTime(145 + strength * 45, time);
        osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.46 * strength, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
        osc.connect(gain);
        this.connectVoice(gain, 0.04);
        osc.start(time);
        osc.stop(time + 0.2);
        audioEvent("kick", strength * 0.62);
    }

    noiseBurst(time, duration = 0.04, frequency = 5000, strength = 0.5) {
        const source = this.audio.createBufferSource();
        const filter = this.audio.createBiquadFilter();
        const gain = this.audio.createGain();
        source.buffer = this.noiseBuffer;
        source.playbackRate.value = 0.7 + Math.random() * 2.5;
        filter.type = Math.random() > 0.55 ? "bandpass" : "highpass";
        filter.frequency.value = frequency;
        filter.Q.value = 1 + Math.random() * 14;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.2 * strength, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        source.connect(filter).connect(gain);
        this.connectVoice(gain, 0.18 + pointerY * 0.3);
        source.start(time, Math.random());
        source.stop(time + duration + 0.02);
        audioEvent("noise", strength * 0.42);
    }

    metal(time, strength = 0.45) {
        const carrier = this.audio.createOscillator();
        const modulator = this.audio.createOscillator();
        const modGain = this.audio.createGain();
        const gain = this.audio.createGain();
        const base = 170 + Math.random() * 1700;
        carrier.type = Math.random() > 0.5 ? "square" : "sine";
        carrier.frequency.value = base;
        modulator.frequency.value = base * (1.7 + Math.random() * 4.8);
        modGain.gain.value = base * (0.5 + pointerY * 2.2);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.1 * strength, time + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055 + pointerY * 0.08);
        modulator.connect(modGain).connect(carrier.frequency);
        carrier.connect(gain);
        this.connectVoice(gain, 0.26);
        carrier.start(time);
        modulator.start(time);
        carrier.stop(time + 0.16);
        modulator.stop(time + 0.16);
        audioEvent("metal", strength * 0.5);
    }

    scheduleStep(time) {
        const density = 0.2 + pointerX * 0.75;
        const agitation = 0.15 + pointerY * 0.85;
        const sixteenth = 60 / this.tempo / 4;

        if (this.step % 8 === 0 || (this.step % 8 === 5 && Math.random() < density * 0.5)) {
            this.kick(time, 0.66 + Math.random() * 0.3);
        }
        if (Math.random() < 0.2 + density * 0.46) {
            this.noiseBurst(time, 0.018 + Math.random() * 0.065, 900 + agitation * 10500, 0.35 + agitation * 0.5);
        }
        if (Math.random() < density * 0.38) {
            this.metal(time + Math.random() * sixteenth * 0.4, 0.3 + agitation * 0.5);
        }
        if (Math.random() < density * agitation * 0.2) {
            const repeats = 2 + Math.floor(Math.random() * 3);
            for (let i = 1; i <= repeats; i += 1) {
                this.noiseBurst(time + i * sixteenth / (repeats + 1), 0.009 + Math.random() * 0.018, 2500 + Math.random() * 9000, 0.24 + agitation * 0.38);
            }
        }

        this.step += 1;
        if (this.step % 16 === 0) {
            this.tempo = Math.round(158 + Math.random() * 58);
            this.delay.delayTime.setTargetAtTime(0.035 + Math.random() * 0.18, time, 0.025);
        }
    }

    scheduler() {
        if (!this.audio) return;
        if (this.nextStepTime < this.audio.currentTime - 0.2) {
            this.nextStepTime = this.audio.currentTime + 0.02;
        }
        while (this.nextStepTime < this.audio.currentTime + 0.11) {
            this.scheduleStep(this.nextStepTime);
            this.nextStepTime += 60 / this.tempo / 4;
        }
        meter.textContent = `${this.tempo} BPM / ERROR ${Math.round((pointerX + pointerY) * 49)}%`;
    }

    async start() {
        this.audio = new (window.AudioContext || window.webkitAudioContext)();
        this.input = this.audio.createGain();
        const shaper = this.audio.createWaveShaper();
        const compressor = this.audio.createDynamicsCompressor();
        const master = this.audio.createGain();
        this.delay = this.audio.createDelay(0.5);
        const feedback = this.audio.createGain();
        const delayReturn = this.audio.createGain();

        this.input.gain.value = 0.72;
        shaper.curve = this.makeDistortionCurve();
        shaper.oversample = "2x";
        compressor.threshold.value = -14;
        compressor.knee.value = 5;
        compressor.ratio.value = 18;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.14;
        master.gain.value = 0.48;
        this.delay.delayTime.value = 0.09;
        feedback.gain.value = 0.28;
        delayReturn.gain.value = 0.2;

        this.input.connect(shaper).connect(compressor).connect(master).connect(this.audio.destination);
        this.delay.connect(feedback).connect(this.delay);
        this.delay.connect(delayReturn).connect(compressor);
        this.noiseBuffer = this.createNoiseBuffer();
        this.audio.resume().catch((error) => console.warn("Audio resume pending", error));
        this.nextStepTime = this.audio.currentTime + 0.06;
        this.timer = window.setInterval(() => this.scheduler(), 25);
        this.scheduler();
    }

    surge() {
        if (!this.audio) return;
        const now = this.audio.currentTime + 0.015;
        this.kick(now, 1);
        for (let i = 0; i < 7; i += 1) {
            this.noiseBurst(now + i * 0.018, 0.025 + Math.random() * 0.05, 900 + Math.random() * 12000, 0.5 + Math.random() * 0.4);
        }
        this.metal(now + 0.035, 0.9);
        blast = 1.2;
    }
}

const engine = new GlitchEngine();

function drawBackground(now) {
    ctx.fillStyle = visualEnergy > 0.8 ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, width, height);

    const spacing = 4 + Math.round(pointerY * 8);
    ctx.fillStyle = `rgba(255,255,255,${0.018 + visualEnergy * 0.025})`;
    for (let y = (now * 0.025) % spacing; y < height; y += spacing) {
        ctx.fillRect(0, y, width, 1);
    }

    const columns = 7 + Math.floor(pointerX * 16);
    for (let i = 0; i < columns; i += 1) {
        const x = ((i / columns) * width + now * (0.01 + i * 0.0008)) % width;
        const barWidth = 1 + (i % 3) * visualEnergy * 10;
        ctx.fillStyle = `${palette[i % palette.length]}${visualEnergy > 0.4 ? "22" : "0a"}`;
        ctx.fillRect(x, 0, barWidth, height);
    }
}

function drawGlyphField(now) {
    const count = reducedMotion ? 16 : 28 + Math.floor(pointerX * 26);
    ctx.font = `${10 + Math.floor(pointerY * 17)}px "Courier New", monospace`;
    ctx.textBaseline = "middle";
    for (let i = 0; i < count; i += 1) {
        const seed = i * 197.31;
        const x = (seed * 13.7 + now * (0.008 + (i % 7) * 0.003)) % (width + 120) - 60;
        const y = (seed * 5.3 + Math.sin(now * 0.0005 + i) * 80 + i * 31) % (height + 80) - 40;
        const char = String.fromCharCode(33 + ((i * 29 + Math.floor(now * 0.012)) % 92));
        ctx.fillStyle = palette[(i + Math.floor(now / 700)) % palette.length];
        ctx.globalAlpha = 0.12 + (i % 5) * 0.055 + visualEnergy * 0.12;
        ctx.fillText(char + marks[(i + Math.floor(now / 300)) % marks.length], x, y);
    }
    ctx.globalAlpha = 1;
}

function drawCentralTransmission(now) {
    if (now - lastPhraseChange > 1500 + (1 - pointerX) * 2200) {
        activePhrase = nextPhrase();
        activeDisplay = zalgo(activePhrase, 2 + pointerY * 3);
        renderPhrase();
        lastPhraseChange = now;
    }

    const jitter = visualEnergy * 22 + blast * 34;
    const x = width * (0.5 + (pointerX - 0.5) * 0.12);
    const y = height * (0.5 + (pointerY - 0.5) * 0.12);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((pointerX - 0.5) * 0.08 + Math.sin(now * 0.0007) * visualEnergy * 0.025);
    const scale = Math.min(1, width / 1700);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.72 + visualEnergy * 0.18;
    ctx.drawImage(
        phraseCanvas,
        -phraseCanvas.width / 2 + (Math.random() - 0.5) * jitter,
        -phraseCanvas.height / 2 + (Math.random() - 0.5) * jitter
    );
    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawBursts(now) {
    for (let i = eventBursts.length - 1; i >= 0; i -= 1) {
        const burst = eventBursts[i];
        const age = now - burst.born;
        if (age > 900) {
            eventBursts.splice(i, 1);
            continue;
        }
        const life = 1 - age / 900;
        const radius = age * 0.13 * (0.5 + burst.strength);
        ctx.save();
        ctx.globalAlpha = life * (0.25 + burst.strength * 0.45);
        ctx.strokeStyle = burst.color;
        ctx.lineWidth = 1 + burst.strength * 7;
        ctx.translate(burst.x, burst.y);
        ctx.rotate(age * 0.006 * (i % 2 ? 1 : -1));
        if (burst.type === "kick") {
            ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
        } else if (burst.type === "metal") {
            for (let arm = 0; arm < 6; arm += 1) {
                ctx.rotate(Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(radius * 1.8, 0);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawTears() {
    if (visualEnergy < 0.18 || reducedMotion) return;
    const tears = Math.min(5, Math.floor(1 + visualEnergy * 3));
    for (let i = 0; i < tears; i += 1) {
        const y = Math.random() * height;
        const stripHeight = 2 + Math.random() * (5 + visualEnergy * 18);
        const offset = (Math.random() - 0.5) * (20 + visualEnergy * 140);
        ctx.globalAlpha = 0.12 + visualEnergy * 0.15;
        ctx.fillStyle = palette[(i + Math.floor(y)) % palette.length];
        ctx.fillRect(offset, y, width * (0.2 + Math.random() * 0.8), stripHeight);
        ctx.fillStyle = "#000";
        ctx.fillRect(width - offset, y + stripHeight, -width * Math.random() * 0.5, 1 + stripHeight * 0.25);
    }
    ctx.globalAlpha = 1;
}

function drawFrame(timestamp) {
    const frameInterval = 1000 / (reducedMotion ? 20 : 30);
    if (timestamp - lastFrame >= frameInterval) {
        lastFrame = timestamp;
        visualEnergy *= 0.9;
        blast *= 0.86;
        drawBackground(timestamp);
        drawGlyphField(timestamp);
        drawCentralTransmission(timestamp);
        drawBursts(timestamp);
        drawTears();

        if (blast > 0.52 && Math.random() < blast * 0.18) {
            ctx.fillStyle = `rgba(245,247,239,${Math.min(0.48, blast * 0.3)})`;
            ctx.fillRect(0, 0, width, height);
        }
    }
    window.requestAnimationFrame(drawFrame);
}

window.addEventListener("pointermove", (event) => {
    pointerX = Math.max(0, Math.min(1, event.clientX / width));
    pointerY = Math.max(0, Math.min(1, event.clientY / height));
});

window.addEventListener("pointerdown", () => {
    if (!started) return;
    engine.surge();
    activePhrase = nextPhrase();
    activeDisplay = zalgo(activePhrase, 3 + pointerY * 3);
    renderPhrase();
    lastPhraseChange = performance.now();
});

gate.addEventListener("click", async () => {
    if (started) return;
    gate.disabled = true;
    gate.querySelector("span").textContent = "CONNECTING";
    try {
        await engine.start();
        started = true;
        document.body.dataset.started = "true";
        gate.classList.add("is-gone");
        visualEnergy = 1;
        blast = 0.8;
    } catch (error) {
        gate.disabled = false;
        gate.querySelector("span").textContent = "AUDIO FAILED / RETRY";
        console.error(error);
    }
});

window.addEventListener("resize", resize);
resize();
renderPhrase();
loadWikipediaPhrases();
window.requestAnimationFrame(drawFrame);
