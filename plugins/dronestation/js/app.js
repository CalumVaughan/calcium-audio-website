const patchExportURL = "export/patch.export.json";
const e = React.createElement;

const palettes = [
    { name: "ember", hueA: 10, hueB: 42, hueC: 175 },
    { name: "ion", hueA: 196, hueB: 145, hueC: 318 },
    { name: "acid", hueA: 78, hueB: 158, hueC: 24 },
    { name: "violet", hueA: 282, hueB: 212, hueC: 350 },
    { name: "white", hueA: 0, hueB: 0, hueC: 190, mono: true }
];

const paramRanges = {
    root: [20, 200],
    spread: [0, 1],
    motion: [0, 1],
    brightness: [0, 1],
    density: [0, 1],
    drive: [0, 1],
    delayMix: [0, 1],
    delayTime: [20, 2000],
    delayFeedback: [0, 0.95],
    reverbMix: [0, 1],
    reverbSize: [0, 1],
    reverbDamp: [0, 1],
    level: [0, 1]
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function scale(norm, min, max) {
    return min + clamp(norm, 0, 1) * (max - min);
}

function normValue(param) {
    return (param.value - param.min) / (param.max - param.min || 1);
}

function normAudioValue(name, value) {
    const range = paramRanges[name] || [0, 1];
    return clamp((value - range[0]) / (range[1] - range[0] || 1), 0, 1);
}

function formatValue(value, name) {
    if (name === "delayTime") return `${Math.round(value)}ms`;
    if (name === "root") return `${value.toFixed(1)}hz`;
    return value.toFixed(2);
}

function getParameterMap(device) {
    const map = new Map();
    device.parameters.forEach((param) => map.set(param.name, param));
    return map;
}

function setParam(paramMap, name, value) {
    const param = paramMap.get(name);
    if (!param) return value;
    const nextValue = clamp(value, param.min, param.max);
    param.value = nextValue;
    return nextValue;
}

function clampParamValue(paramMap, name, value) {
    const param = paramMap.get(name);
    if (!param) return value;
    return clamp(value, param.min, param.max);
}

function colorFromHue(palette, slot, alpha, lightness = 62) {
    if (palette.mono) return `hsla(${slot === 2 ? palette.hueC : 0}, 0%, ${lightness + 20}%, ${alpha})`;
    return `hsla(${[palette.hueA, palette.hueB, palette.hueC][slot % 3]}, 88%, ${lightness}%, ${alpha})`;
}

function readNorms(values) {
    return {
        root: typeof values.root === "number" ? normAudioValue("root", values.root) : 0.13,
        spread: typeof values.spread === "number" ? normAudioValue("spread", values.spread) : 0.37,
        motion: typeof values.motion === "number" ? normAudioValue("motion", values.motion) : 0.45,
        brightness: typeof values.brightness === "number" ? normAudioValue("brightness", values.brightness) : 0.62,
        density: typeof values.density === "number" ? normAudioValue("density", values.density) : 0.72,
        drive: typeof values.drive === "number" ? normAudioValue("drive", values.drive) : 0.38,
        delayMix: typeof values.delayMix === "number" ? normAudioValue("delayMix", values.delayMix) : 0.32,
        delayTime: typeof values.delayTime === "number" ? normAudioValue("delayTime", values.delayTime) : 0.3,
        delayFeedback: typeof values.delayFeedback === "number" ? normAudioValue("delayFeedback", values.delayFeedback) : 0.48,
        reverbMix: typeof values.reverbMix === "number" ? normAudioValue("reverbMix", values.reverbMix) : 0.48,
        reverbSize: typeof values.reverbSize === "number" ? normAudioValue("reverbSize", values.reverbSize) : 0.72,
        reverbDamp: typeof values.reverbDamp === "number" ? normAudioValue("reverbDamp", values.reverbDamp) : 0.38,
        level: typeof values.level === "number" ? normAudioValue("level", values.level) : 0.75
    };
}

function reactivePalette(basePalette, p) {
    if (basePalette.mono) return basePalette;
    return {
        name: basePalette.name,
        hueA: (basePalette.hueA + p.root * 120 + p.drive * 58 + p.motion * 26) % 360,
        hueB: (basePalette.hueB + p.brightness * 90 + p.delayTime * 62 + p.level * 20) % 360,
        hueC: (basePalette.hueC + p.reverbMix * 110 + p.spread * 70 + p.density * 38) % 360
    };
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (window.RNBO) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = `https://c74-public.nyc3.digitaloceanspaces.com/rnbo/${encodeURIComponent(version)}/rnbo.min.js`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load rnbo.js v${version}`));
        document.body.append(script);
    });
}

async function loadDependencies() {
    try {
        const response = await fetch("export/dependencies.json");
        if (!response.ok) return [];
        const dependencies = await response.json();
        return dependencies.map((item) => item.file ? Object.assign({}, item, { file: `export/${item.file}` }) : item);
    } catch (error) {
        return [];
    }
}

async function createRNBODevice() {
    const response = await fetch(patchExportURL);
    const patcher = await response.json();
    await loadRNBOScript(patcher.desc.meta.rnboversion);

    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();
    const outputNode = context.createGain();
    outputNode.connect(context.destination);

    const device = await RNBO.createDevice({ context, patcher });
    const dependencies = await loadDependencies();
    if (dependencies.length) await device.loadDataBufferDependencies(dependencies);
    device.node.connect(outputNode);

    return { context, device, patcher };
}

function useVisual(valuesRef, paletteRef, pointerRef, readyRef) {
    React.useEffect(() => {
        const canvas = document.getElementById("drone-visual");
        const ctx = canvas.getContext("2d");
        let frame = 0;
        let raf = 0;
        const grains = Array.from({ length: 64 }, (_, index) => ({
            seed: index * 19.37,
            lane: index % 13,
            drift: 0.15 + (index % 11) * 0.021
        }));

        function resize() {
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = Math.floor(window.innerWidth * ratio);
            canvas.height = Math.floor(window.innerHeight * ratio);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }

        function drawParameterLayers(width, height, values, palette, p) {
            const centerX = width * (0.5 + Math.sin(frame * 0.13 + p.delayTime * 3.4) * 0.1);
            const centerY = height * (0.52 + Math.cos(frame * 0.11 + p.spread * 2.2) * 0.08);
            const minSide = Math.min(width, height);

            ctx.save();
            ctx.globalCompositeOperation = "screen";

            for (let i = 0; i < 9; i += 1) {
                const radius = minSide * (0.09 + i * 0.055 + p.root * 0.09 + p.reverbSize * 0.04);
                const wobble = Math.sin(frame * (0.38 + p.motion * 0.8) + i * 1.7) * p.spread * 34;
                ctx.beginPath();
                ctx.ellipse(
                    centerX,
                    centerY,
                    radius + wobble,
                    radius * (0.42 + p.reverbMix * 0.46) - wobble * 0.3,
                    frame * (0.04 + p.motion * 0.09) + i * 0.36,
                    0,
                    Math.PI * 2
                );
                ctx.strokeStyle = colorFromHue(palette, i, 0.035 + p.root * 0.065 + p.level * 0.035, 58 + p.brightness * 16);
                ctx.lineWidth = 0.6 + p.reverbSize * 2.8;
                ctx.stroke();
            }

            const cells = 7 + Math.floor(p.density * 9);
            for (let i = 0; i < cells; i += 1) {
                const sides = 3 + ((i + Math.floor(p.drive * 9)) % 7);
                const cx = width * (0.5 + Math.sin(frame * (0.13 + i * 0.01) + i * 2.21) * (0.14 + p.spread * 0.26));
                const cy = height * (0.5 + Math.cos(frame * (0.11 + i * 0.012) + i * 1.7) * (0.12 + p.reverbMix * 0.24));
                const rad = minSide * (0.07 + i * 0.018 + p.delayMix * 0.09 + p.reverbSize * 0.08);
                ctx.beginPath();
                for (let v = 0; v <= sides; v += 1) {
                    const a = (v / sides) * Math.PI * 2 + frame * (0.09 + p.motion * 0.32) + i;
                    const fold = 1 + Math.sin(a * (2 + p.spread * 6) + frame) * p.drive * 0.24;
                    const x = cx + Math.cos(a) * rad * fold;
                    const y = cy + Math.sin(a) * rad * fold * (0.6 + p.brightness * 0.7);
                    if (v === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = colorFromHue(palette, i + 2, 0.035 + p.level * 0.07 + p.brightness * 0.04, 52 + p.brightness * 22);
                ctx.lineWidth = 0.7 + p.drive * 1.6 + p.level;
                ctx.stroke();
            }

            const rays = 10 + Math.floor(p.brightness * 22);
            for (let i = 0; i < rays; i += 1) {
                const angle = (i / rays) * Math.PI * 2 + frame * (0.08 + p.motion * 0.24);
                const inner = minSide * (0.05 + p.root * 0.08);
                const outer = minSide * (0.25 + p.brightness * 0.42 + p.level * 0.18);
                const twist = Math.sin(frame * 1.7 + i * p.spread) * p.drive * 0.24;
                ctx.beginPath();
                ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
                ctx.lineTo(centerX + Math.cos(angle + twist) * outer, centerY + Math.sin(angle + twist) * outer);
                ctx.strokeStyle = colorFromHue(palette, 1, 0.018 + p.brightness * 0.045, 66);
                ctx.lineWidth = 0.35 + p.level * 1.5;
                ctx.stroke();
            }

            const echoCount = 3 + Math.floor(p.delayFeedback * 6);
            for (let i = 0; i < echoCount; i += 1) {
                const offset = (i + 1) * (18 + p.delayTime * 90);
                const alpha = (0.06 + p.delayMix * 0.15) * (1 - i / Math.max(1, echoCount));
                ctx.beginPath();
                ctx.arc(
                    width * p.pointerX + Math.sin(frame * 0.7 + i) * offset,
                    height * p.pointerY + Math.cos(frame * 0.53 + i) * offset * 0.55,
                    18 + i * 9 + p.delayMix * 42,
                    0,
                    Math.PI * 2
                );
                ctx.strokeStyle = colorFromHue(palette, 1, alpha, 62);
                ctx.lineWidth = 1 + p.delayFeedback * 3;
                ctx.stroke();
            }

            const fractures = Math.floor(p.drive * 16);
            for (let i = 0; i < fractures; i += 1) {
                const sx = ((Math.sin(i * 12.989 + frame * 0.71) * 43758.5453) % 1 + 1) % 1 * width;
                const sy = ((Math.sin(i * 78.233 + frame * 0.39) * 24634.6345) % 1 + 1) % 1 * height;
                const length = 28 + p.drive * 140;
                const angle = frame * 0.2 + i * 2.41;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + Math.cos(angle) * length, sy + Math.sin(angle) * length);
                ctx.strokeStyle = colorFromHue(palette, 0, 0.045 + p.drive * 0.11, 68);
                ctx.lineWidth = 0.6 + p.drive * 2.2;
                ctx.stroke();
            }

            const fogCount = 2 + Math.floor(p.reverbMix * 3);
            for (let i = 0; i < fogCount; i += 1) {
                const x = width * (0.12 + ((i * 0.19 + Math.sin(frame * 0.05 + i) * 0.08) % 0.82));
                const y = height * (0.18 + ((i * 0.23 + Math.cos(frame * 0.04 + i) * 0.07) % 0.72));
                const fog = ctx.createRadialGradient(x, y, 0, x, y, minSide * (0.18 + p.reverbSize * 0.34));
                fog.addColorStop(0, colorFromHue(palette, 2, (0.025 + p.reverbMix * 0.08) * (1 - p.reverbDamp * 0.55), 60));
                fog.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = fog;
                ctx.fillRect(0, 0, width, height);
            }

            ctx.restore();
        }

        function draw() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const values = valuesRef.current;
            const basePalette = paletteRef.current;
            const pointer = pointerRef.current;
            const root = typeof values.root === "number" ? normAudioValue("root", values.root) : 0.13;
            const spread = typeof values.spread === "number" ? normAudioValue("spread", values.spread) : 0.37;
            const motion = typeof values.motion === "number" ? normAudioValue("motion", values.motion) : 0.45;
            const brightness = typeof values.brightness === "number" ? normAudioValue("brightness", values.brightness) : 0.62;
            const density = typeof values.density === "number" ? normAudioValue("density", values.density) : 0.72;
            const drive = typeof values.drive === "number" ? normAudioValue("drive", values.drive) : 0.38;
            const delayMix = typeof values.delayMix === "number" ? normAudioValue("delayMix", values.delayMix) : 0.32;
            const delayTime = typeof values.delayTime === "number" ? normAudioValue("delayTime", values.delayTime) : 0.3;
            const delayFeedback = typeof values.delayFeedback === "number" ? normAudioValue("delayFeedback", values.delayFeedback) : 0.48;
            const reverbMix = typeof values.reverbMix === "number" ? normAudioValue("reverbMix", values.reverbMix) : 0.48;
            const reverbSize = typeof values.reverbSize === "number" ? normAudioValue("reverbSize", values.reverbSize) : 0.72;
            const reverbDamp = typeof values.reverbDamp === "number" ? normAudioValue("reverbDamp", values.reverbDamp) : 0.38;
            const level = typeof values.level === "number" ? normAudioValue("level", values.level) : 0.75;
            const normalized = {
                root,
                spread,
                motion,
                brightness,
                density,
                drive,
                delayMix,
                delayTime,
                delayFeedback,
                reverbMix,
                reverbSize,
                reverbDamp,
                level,
                pointerX: pointer.x,
                pointerY: pointer.y
            };
            const palette = basePalette.mono ? basePalette : {
                name: basePalette.name,
                hueA: (basePalette.hueA + root * 90 + drive * 42) % 360,
                hueB: (basePalette.hueB + brightness * 74 + delayTime * 34) % 360,
                hueC: (basePalette.hueC + reverbMix * 86 + spread * 46) % 360
            };

            frame += 0.004 + motion * 0.026;

            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = `rgba(0,0,0,${0.17 + (1 - reverbMix) * 0.18 + reverbDamp * 0.09})`;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "#000";
            if (!readyRef.current) ctx.fillRect(0, 0, width, height);

            const gradient = ctx.createRadialGradient(
                width * pointer.x,
                height * pointer.y,
                0,
                width * (0.45 + Math.sin(frame * 0.1) * 0.16),
                height * 0.52,
                Math.max(width, height) * (0.75 + reverbSize * 0.55)
            );
            if (palette.mono) {
                gradient.addColorStop(0, `hsla(0, 0%, ${52 + brightness * 38}%, ${0.05 + brightness * 0.12})`);
                gradient.addColorStop(0.45, `hsla(${palette.hueC}, 50%, 50%, ${0.03 + reverbMix * 0.08})`);
            } else {
                gradient.addColorStop(0, `hsla(${palette.hueA}, 92%, 58%, ${0.07 + brightness * 0.16})`);
                gradient.addColorStop(0.38, `hsla(${palette.hueB}, 86%, 54%, ${0.04 + reverbMix * 0.14})`);
            }
            gradient.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            drawParameterLayers(width, height, values, palette, normalized);

            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const ribbons = 5 + Math.floor(density * 7);
            for (let i = 0; i < ribbons; i += 1) {
                const hue = palette.mono ? 0 : [palette.hueA, palette.hueB, palette.hueC][i % 3];
                const alpha = palette.mono ? 0.035 + brightness * 0.045 : 0.032 + brightness * 0.085;
                ctx.beginPath();
                for (let x = -40; x <= width + 40; x += 24) {
                    const phase = frame * (0.8 + i * 0.07 + delayFeedback * 0.35);
                    const t = (x + 40) / (width + 80);
                    const baseY = height * (0.12 + i / Math.max(1, ribbons - 1) * 0.78);
                    const fold = Math.sin((t * Math.PI * 2 + phase) * (1 + spread * 4.8) + root * 8);
                    const cross = Math.cos((t * Math.PI * 7 - phase * 1.4) * (0.55 + delayTime));
                    const rupture = Math.sin(t * Math.PI * 31 + phase * 3.2 + i) * drive;
                    const y = baseY + fold * (20 + brightness * 88) + cross * delayMix * 92 + rupture * 30;
                    const skew = Math.sin(t * Math.PI * 5 + frame + i) * reverbMix * 54;
                    if (x === -40) ctx.moveTo(x, y);
                    else ctx.lineTo(x + skew, y);
                }
                ctx.strokeStyle = `hsla(${hue}, ${palette.mono ? 0 : 84}%, ${palette.mono ? 82 : 58 + i * 2}%, ${alpha})`;
                ctx.lineWidth = 0.6 + level * 2.2 + reverbSize * 1.2;
                ctx.stroke();
            }

            grains.forEach((grain, index) => {
                const angle = frame * grain.drift + grain.seed;
                const radius = (0.08 + (index % 17) * 0.024 + reverbSize * 0.12) * Math.min(width, height);
                const cx = width * (0.5 + Math.sin(frame * 0.19 + delayTime * 4) * 0.12);
                const cy = height * (0.5 + Math.cos(frame * 0.16 + spread * 3) * 0.1);
                const x = cx + Math.cos(angle * (1 + spread * 0.4)) * radius * (1 + delayMix * 1.5);
                const y = cy + Math.sin(angle * (0.74 + reverbDamp * 0.36)) * radius;
                const hue = palette.mono ? 0 : [palette.hueA, palette.hueB, palette.hueC][grain.lane % 3];
                ctx.fillStyle = `hsla(${hue}, ${palette.mono ? 0 : 86}%, ${palette.mono ? 88 : 62}%, ${0.08 + density * 0.18})`;
                ctx.beginPath();
                ctx.arc(x, y, 0.8 + brightness * 2.2 + drive * (index % 4), 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();

            raf = requestAnimationFrame(draw);
        }

        resize();
        window.addEventListener("resize", resize);
        draw();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, [valuesRef, paletteRef, pointerRef, readyRef]);
}

function useThreeGeometry(valuesRef, paletteRef, pointerRef, readyRef) {
    React.useEffect(() => {
        const canvas = document.getElementById("drone-space");
        const gl = canvas?.getContext("webgl", {
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        if (!canvas || !gl) return undefined;

        const vertexSource = `
            precision mediump float;
            attribute float aIndex;
            uniform float uTime;
            uniform vec2 uResolution;
            uniform vec2 uPointer;
            uniform float uParams[13];
            varying float vShade;
            varying float vBand;

            mat2 rot(float a) {
                float s = sin(a);
                float c = cos(a);
                return mat2(c, -s, s, c);
            }

            void main() {
                float root = uParams[0];
                float spread = uParams[1];
                float motion = uParams[2];
                float brightness = uParams[3];
                float density = uParams[4];
                float drive = uParams[5];
                float delayMix = uParams[6];
                float delayTime = uParams[7];
                float delayFeedback = uParams[8];
                float reverbMix = uParams[9];
                float reverbSize = uParams[10];
                float reverbDamp = uParams[11];
                float level = uParams[12];

                float i = aIndex;
                float band = mod(i, 29.0) / 29.0;
                float shell = floor(mod(i, 377.0) / 29.0);
                float t = uTime * (0.55 + motion * 2.7);
                float a = i * 0.091 + t + delayTime * 6.2831;
                float b = i * 0.047 - t * (0.42 + delayFeedback * 1.3);
                float radius = (0.42 + band * 2.45) * (0.7 + reverbSize * 1.05 + density * 0.42);

                vec3 p;
                p.x = cos(a * (1.0 + spread * 3.4) + sin(b) * drive) * radius;
                p.y = sin(b * (0.8 + brightness * 1.8)) * radius * (0.48 + brightness * 0.82);
                p.z = sin(a * 0.61 + shell * 0.37) * radius * (0.7 + reverbMix * 1.15);

                p.xy *= rot(t * (0.08 + motion * 0.28) + (uPointer.x - 0.5) * 1.2);
                p.xz *= rot(t * (0.05 + spread * 0.22) + (uPointer.y - 0.5) * 0.9);

                float fold = sin(p.x * (2.0 + root * 7.0) + t * 1.7) * drive * 0.52;
                p.xy += vec2(cos(b), sin(a)) * delayMix * delayFeedback * (0.18 + band * 0.9);
                p.z += fold + sin(shell + t) * reverbDamp * 0.36;

                float perspective = 1.0 / (3.9 + p.z * 0.34 - root * 0.8 + reverbSize * 0.65);
                vec2 screen = p.xy * perspective;
                screen.x *= uResolution.y / max(1.0, uResolution.x);

                gl_Position = vec4(screen, 0.0, 1.0);
                gl_PointSize = (1.0 + brightness * 5.0 + level * 2.2 + drive * band * 3.0) * (0.72 + perspective * 2.8);
                vShade = clamp(0.18 + brightness * 0.52 + density * band * 0.42 + level * 0.25, 0.0, 1.0);
                vBand = fract(band + root * 0.4 + delayTime * 0.25);
            }
        `;

        const fragmentSource = `
            precision mediump float;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            uniform vec3 uColorC;
            uniform float uParams[13];
            varying float vShade;
            varying float vBand;

            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float d = length(uv);
                float drive = uParams[5];
                float reverbMix = uParams[9];
                float edge = smoothstep(0.5, 0.05 + drive * 0.08, d);
                vec3 color = mix(uColorA, uColorB, smoothstep(0.12, 0.68, vBand));
                color = mix(color, uColorC, smoothstep(0.55, 1.0, vBand) * (0.25 + reverbMix * 0.75));
                float alpha = edge * (0.16 + vShade * 0.78);
                gl_FragColor = vec4(color * (0.55 + vShade), alpha);
            }
        `;

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
            }
            return shader;
        }

        const program = gl.createProgram();
        gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || "WebGL link failed");
        }

        const pointCount = 1500;
        const indices = new Float32Array(pointCount);
        for (let i = 0; i < pointCount; i += 1) indices[i] = i;

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const aIndex = gl.getAttribLocation(program, "aIndex");
        const uTime = gl.getUniformLocation(program, "uTime");
        const uResolution = gl.getUniformLocation(program, "uResolution");
        const uPointer = gl.getUniformLocation(program, "uPointer");
        const uParams = gl.getUniformLocation(program, "uParams");
        const uColorA = gl.getUniformLocation(program, "uColorA");
        const uColorB = gl.getUniformLocation(program, "uColorB");
        const uColorC = gl.getUniformLocation(program, "uColorC");

        const params = new Float32Array(13);
        let raf = 0;
        let time = 0;

        function hslToRgb(h, s, l) {
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = l - c / 2;
            let r = 0, g = 0, b = 0;
            if (h < 60) [r, g, b] = [c, x, 0];
            else if (h < 120) [r, g, b] = [x, c, 0];
            else if (h < 180) [r, g, b] = [0, c, x];
            else if (h < 240) [r, g, b] = [0, x, c];
            else if (h < 300) [r, g, b] = [x, 0, c];
            else [r, g, b] = [c, 0, x];
            return [r + m, g + m, b + m];
        }

        function resize() {
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = Math.floor(window.innerWidth * ratio);
            canvas.height = Math.floor(window.innerHeight * ratio);
            gl.viewport(0, 0, canvas.width, canvas.height);
        }

        function draw() {
            const p = readNorms(valuesRef.current);
            const palette = reactivePalette(paletteRef.current, p);
            const pointer = pointerRef.current;
            const active = readyRef.current ? 1 : 0.38;

            params.set([
                p.root, p.spread, p.motion, p.brightness, p.density, p.drive, p.delayMix,
                p.delayTime, p.delayFeedback, p.reverbMix, p.reverbSize, p.reverbDamp, p.level
            ]);
            time += 0.006 + p.motion * 0.034;

            gl.useProgram(program);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(aIndex);
            gl.vertexAttribPointer(aIndex, 1, gl.FLOAT, false, 0, 0);

            const colorA = palette.mono ? [0.95, 0.95, 0.95] : hslToRgb(palette.hueA, 0.92, 0.58 + p.brightness * 0.14);
            const colorB = palette.mono ? [0.68, 0.68, 0.68] : hslToRgb(palette.hueB, 0.9, 0.52 + p.level * 0.16);
            const colorC = palette.mono ? hslToRgb(palette.hueC, 0.42, 0.62) : hslToRgb(palette.hueC, 0.88, 0.56 + p.reverbMix * 0.18);

            gl.uniform1f(uTime, time);
            gl.uniform2f(uResolution, canvas.width, canvas.height);
            gl.uniform2f(uPointer, pointer.x, pointer.y);
            gl.uniform1fv(uParams, params);
            gl.uniform3f(uColorA, colorA[0] * active, colorA[1] * active, colorA[2] * active);
            gl.uniform3f(uColorB, colorB[0] * active, colorB[1] * active, colorB[2] * active);
            gl.uniform3f(uColorC, colorC[0] * active, colorC[1] * active, colorC[2] * active);
            gl.drawArrays(gl.POINTS, 0, pointCount);

            raf = requestAnimationFrame(draw);
        }

        resize();
        window.addEventListener("resize", resize);
        draw();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, [valuesRef, paletteRef, pointerRef, readyRef]);
}

function App() {
    const [deviceState, setDeviceState] = React.useState(null);
    const [error, setError] = React.useState("");
    const [values, setValues] = React.useState({});
    const [paletteIndex, setPaletteIndex] = React.useState(1);
    const [pointer, setPointer] = React.useState({ x: 0.5, y: 0.5 });
    const [audioState, setAudioState] = React.useState("idle");

    const valuesRef = React.useRef(values);
    const paletteRef = React.useRef(palettes[paletteIndex]);
    const pointerRef = React.useRef(pointer);
    const readyRef = React.useRef(false);
    const targetValuesRef = React.useRef({});
    const smoothedValuesRef = React.useRef({});
    const lastStatePushRef = React.useRef(0);
    const gestureRef = React.useRef({ x: 0.5, y: 0.5, speed: 0, angle: 0, lastT: 0 });

    const paramMap = React.useMemo(() => {
        return deviceState ? getParameterMap(deviceState.device) : new Map();
    }, [deviceState]);

    React.useEffect(() => {
        valuesRef.current = values;
    }, [values]);

    React.useEffect(() => {
        paletteRef.current = palettes[paletteIndex];
    }, [paletteIndex]);

    React.useEffect(() => {
        pointerRef.current = pointer;
    }, [pointer]);

    React.useEffect(() => {
        readyRef.current = Boolean(deviceState);
    }, [deviceState]);

    useVisual(valuesRef, paletteRef, pointerRef, readyRef);
    useThreeGeometry(valuesRef, paletteRef, pointerRef, readyRef);

    React.useEffect(() => {
        let mounted = true;
        createRNBODevice()
            .then((state) => {
                if (!mounted) return;
                const nextValues = {};
                state.device.parameters.forEach((param) => {
                    nextValues[param.name] = param.value;
                });
                targetValuesRef.current = Object.assign({}, nextValues);
                smoothedValuesRef.current = Object.assign({}, nextValues);
                setDeviceState(state);
                setValues(nextValues);
                setAudioState(state.context.state);
            })
            .catch((err) => {
                if (mounted) setError(err.message || String(err));
            });

        return () => {
            mounted = false;
        };
    }, []);

    React.useEffect(() => {
        if (!deviceState) return undefined;
        let raf = 0;

        function smoothParams() {
            const paramMapNow = getParameterMap(deviceState.device);
            Object.keys(targetValuesRef.current).forEach((name) => {
                const param = paramMapNow.get(name);
                if (!param) return;

                const target = targetValuesRef.current[name];
                const current = smoothedValuesRef.current[name] ?? target;
                const smoothing = name === "delayTime" || name === "root" ? 0.045 : 0.09;
                const next = Math.abs(target - current) < 0.0005 ? target : current + (target - current) * smoothing;
                smoothedValuesRef.current[name] = next;
                param.value = next;
            });

            raf = requestAnimationFrame(smoothParams);
        }

        raf = requestAnimationFrame(smoothParams);
        return () => cancelAnimationFrame(raf);
    }, [deviceState]);

    async function startAudio() {
        if (!deviceState) return;
        await deviceState.context.resume();
        setAudioState(deviceState.context.state);
    }

    function updateParam(name, value) {
        const nextValue = clampParamValue(paramMap, name, value);
        targetValuesRef.current[name] = nextValue;
        valuesRef.current = Object.assign({}, valuesRef.current, { [name]: nextValue });

        const now = performance.now();
        if (now - lastStatePushRef.current > 45) {
            lastStatePushRef.current = now;
            setValues(valuesRef.current);
        }
    }

    function performSurface(event) {
        if (!deviceState) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        const previous = gestureRef.current;
        const nowMs = performance.now();
        const dt = Math.max(16, nowMs - (previous.lastT || nowMs));
        const dx = x - previous.x;
        const dy = y - previous.y;
        const speed = clamp(Math.sqrt(dx * dx + dy * dy) / (dt / 1000) * 0.9, 0, 1);
        const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        gestureRef.current = { x, y, speed, angle, lastT: nowMs };

        const center = clamp(1 - Math.hypot(x - 0.5, y - 0.5) * 1.65, 0, 1);
        const diagonal = clamp((x + (1 - y)) * 0.5, 0, 1);
        const orbit = (Math.sin((x * 5.1 + y * 3.7 + angle * 2.5) * Math.PI) + 1) * 0.5;
        const nextValues = {};

        const assignments = {
            root: x,
            spread: Math.abs(x - 0.5) * 2,
            motion: clamp(speed * 0.75 + diagonal * 0.25, 0, 1),
            brightness: 1 - y,
            density: clamp(center * 0.55 + orbit * 0.45, 0, 1),
            drive: clamp(speed * 0.85 + Math.abs(y - 0.5) * 0.3, 0, 1),
            delayMix: clamp(x * 0.55 + angle * 0.45, 0, 1),
            delayTime: clamp(0.12 + orbit * 0.78 + speed * 0.1, 0, 1),
            delayFeedback: clamp((1 - center) * 0.55 + speed * 0.4, 0, 0.95),
            reverbMix: y,
            reverbSize: clamp(center * 0.45 + y * 0.55, 0, 1),
            reverbDamp: clamp(1 - speed * 0.7 - (1 - y) * 0.2, 0, 1),
            level: clamp(0.62 + center * 0.2 + speed * 0.12, 0, 1)
        };

        Object.entries(assignments).forEach(([name, amount]) => {
            const param = paramMap.get(name);
            if (param) {
                nextValues[name] = clampParamValue(paramMap, name, scale(amount, param.min, param.max));
                targetValuesRef.current[name] = nextValues[name];
            }
        });
        setPointer({ x, y });
        valuesRef.current = Object.assign({}, valuesRef.current, nextValues);

        const now = performance.now();
        if (now - lastStatePushRef.current > 45) {
            lastStatePushRef.current = now;
            setValues(valuesRef.current);
        }
    }

    function performHover(event) {
        if (!deviceState) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        const previous = gestureRef.current;
        const nowMs = performance.now();
        const dt = Math.max(16, nowMs - (previous.lastT || nowMs));
        const dx = x - previous.x;
        const dy = y - previous.y;
        const speed = clamp(Math.sqrt(dx * dx + dy * dy) / (dt / 1000) * 0.42, 0, 1);
        gestureRef.current = { x, y, speed, angle: previous.angle, lastT: nowMs };

        const center = clamp(1 - Math.hypot(x - 0.5, y - 0.5) * 1.65, 0, 1);
        const hoverAssignments = {
            brightness: clamp(0.18 + (1 - y) * 0.82, 0, 1),
            spread: clamp(Math.abs(x - 0.5) * 1.65 + speed * 0.18, 0, 1),
            reverbMix: clamp(0.18 + y * 0.72, 0, 1),
            motion: clamp(0.18 + speed * 0.62 + x * 0.12, 0, 1),
            density: clamp(0.28 + center * 0.55 + speed * 0.16, 0, 1)
        };
        const nextValues = {};

        Object.entries(hoverAssignments).forEach(([name, amount]) => {
            const param = paramMap.get(name);
            if (param) {
                nextValues[name] = clampParamValue(paramMap, name, scale(amount, param.min, param.max));
                targetValuesRef.current[name] = nextValues[name];
            }
        });

        setPointer({ x, y });
        valuesRef.current = Object.assign({}, valuesRef.current, nextValues);

        const now = performance.now();
        if (now - lastStatePushRef.current > 70) {
            lastStatePushRef.current = now;
            setValues(valuesRef.current);
        }
    }

    function shiftPalette() {
        setPaletteIndex((current) => (current + 1) % palettes.length);
    }

    const palette = palettes[paletteIndex];

    return e("main", {
        className: "visual-instrument",
        onPointerDown: (event) => {
            if (event.target !== event.currentTarget) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            if (event.detail > 1) shiftPalette();
            performSurface(event);
            startAudio();
        },
        onPointerMove: (event) => {
            if (event.target !== event.currentTarget) return;
            if (event.buttons || event.pointerType === "touch") performSurface(event);
            else performHover(event);
        },
        style: {
            "--palette-a": palette.mono ? "hsla(0,0%,96%,0.9)" : `hsl(${palette.hueA}, 88%, 62%)`,
            "--palette-b": palette.mono ? "hsla(0,0%,72%,0.9)" : `hsl(${palette.hueB}, 84%, 58%)`,
            "--palette-c": palette.mono ? `hsl(${palette.hueC}, 58%, 62%)` : `hsl(${palette.hueC}, 84%, 62%)`,
            "--px": `${pointer.x * 100}%`,
            "--py": `${pointer.y * 100}%`
        }
    },
        e("div", { className: "micro-status" }, error || (deviceState ? audioState : "loading")),
        e("div", {
            className: "pointer-core",
            style: {
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`
            }
        })
    );
}

ReactDOM.createRoot(document.getElementById("app-root")).render(e(App));
