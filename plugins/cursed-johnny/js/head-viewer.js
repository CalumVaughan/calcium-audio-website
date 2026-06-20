import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

const stage = document.getElementById("head-stage");
const loadingMessage = document.getElementById("loading-message");
const textureSelect = document.getElementById("texture-select");
const resetButton = document.getElementById("reset-view");
const audioToggle = document.getElementById("audio-toggle");
const randomizeButton = document.getElementById("randomize-all");
const bpmControl = document.getElementById("bpm-control");
const bpmOutput = document.getElementById("bpm-output");
const audioStatus = document.getElementById("audio-status");
const morphSliders = [...document.querySelectorAll("[data-morph]")];
const allSliders = morphSliders;
const tabButtons = [...document.querySelectorAll("[data-tab]")];
const tabPanels = [...document.querySelectorAll("[data-panel]")];

const scene = new THREE.Scene();
const backgroundScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
const backgroundCamera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
backgroundCamera.position.z = 8;
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
// A 1:1 WebGL buffer keeps this 50k-face morphing scan responsive on Retina screens.
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.domElement.setAttribute("aria-label", "Drag to rotate Johnny. Scroll or pinch to zoom.");
stage.appendChild(renderer.domElement);

const controls = new TrackballControls(camera, renderer.domElement);
controls.noPan = true;
controls.rotateSpeed = 3.2;
controls.zoomSpeed = 1.15;
controls.dynamicDampingFactor = 0.12;
controls.staticMoving = true;
controls.minDistance = 1.5;
controls.maxDistance = 8;

for (const eventName of ["pointermove", "wheel", "touchmove"]) {
    renderer.domElement.addEventListener(eventName, () => requestAnimationFrame(render), { passive: true });
}

scene.add(new THREE.HemisphereLight(0xf5eadb, 0x31421d, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(-2, 3, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9dff55, 1.1);
rimLight.position.set(3, 1, -2);
scene.add(rimLight);

const textureLoader = new THREE.TextureLoader();
const texturePaths = {
    diffuse: "JohnnyHead/textures/web/diffuse.jpg",
    normal: "JohnnyHead/textures/web/normal.jpg",
    ao: "JohnnyHead/textures/web/ao.jpg"
};
const textures = {};
for (const [name, path] of Object.entries(texturePaths)) {
    const texture = textureLoader.load(path);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures[name] = texture;
}

let johnny = null;
const morphMeshes = [];
const scanMeshes = [];
const defaultCameraPosition = new THREE.Vector3();

let audioContext = null;
let rnboDevice = null;
let audioInitPromise = null;
let audioRunning = false;
let automationFrame = null;
let mappingGeneration = 0;
let mappingEpoch = performance.now();
let morphMappings = [];

const proceduralRoot = new THREE.Group();
backgroundScene.add(proceduralRoot);
let visualSystems = [];
let visualPalette = [];
let visualBass = 0;
let visualTreble = 0;
let visualBassTarget = 0;
let visualTrebleTarget = 0;
let visualBeatStep = -1;
let visualSpin = 1;
let visualSymmetry = 6;

const prominentMorphs = new Set([
    "NoseLength", "ChinLength", "NeckLength", "NeckWidth",
    "DreadsLength", "DreadSpread", "EyeSize", "EyeProjection",
    "MouthOpen", "MouthWidth", "JawDrop"
]);

rebuildProceduralWorld();

new GLTFLoader().load("JohnnyHead/CursedJohnny.glb", (gltf) => {
    johnny = gltf.scene;
    scene.add(johnny);
    johnny.traverse((child) => {
        if (!child.isMesh) return;
        child.material = child.material.clone();
        child.material.map = textures.diffuse;
        child.material.color.set(0xffffff);
        child.material.roughness = 0.9;
        child.material.metalness = 0;
        child.material.needsUpdate = true;
        scanMeshes.push(child);
        if (child.morphTargetDictionary) {
            child.morphTargetInfluences.fill(0);
            morphMeshes.push(child);
        }
    });
    centreAndFrame(johnny);
    loadingMessage?.remove();
    render();
}, undefined, (error) => {
    console.error("Could not load Johnny's GLB", error);
    loadingMessage.textContent = "Johnny failed to materialise. Run this page from a local web server.";
});

textureSelect.addEventListener("change", () => {
    if (!johnny) return;
    scanMeshes.forEach((mesh) => {
        mesh.material.map = textures[textureSelect.value];
        mesh.material.needsUpdate = true;
    });
    render();
});

morphSliders.forEach((slider) => {
    slider.addEventListener("input", () => {
        setMorph(slider.dataset.morph, Number(slider.value));
        slider.previousElementSibling.querySelector("output").value = `${Math.round(Number(slider.value) * 100)}%`;
        render();
    });
});

allSliders.forEach((slider) => {
    slider.dataset.default = slider.value;
    updateSliderOutput(slider);
});
regenerateMappings();

tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        tabButtons.forEach((candidate) => {
            const active = candidate === button;
            candidate.classList.toggle("active", active);
            candidate.setAttribute("aria-selected", String(active));
        });
        tabPanels.forEach((panel) => {
            const active = panel.dataset.panel === button.dataset.tab;
            panel.classList.toggle("active", active);
            panel.hidden = !active;
        });
    });
});

audioToggle.addEventListener("click", toggleAudio);

randomizeButton.addEventListener("click", async () => {
    regenerateMappings();
    randomizeButton.textContent = "Randomizing…";
    try {
        await startAudio();
        rnboDevice.scheduleEvent(new window.RNBO.MessageEvent(window.RNBO.TimeNow, "randomizeAll", [1]));
        audioStatus.textContent = `Mappings randomized · set ${mappingGeneration}`;
    } catch (error) {
        console.error("Could not randomize RNBO device", error);
        audioStatus.textContent = "Randomize failed · check console";
    } finally {
        randomizeButton.textContent = "Randomize All";
    }
});

bpmControl.addEventListener("input", () => {
    const bpm = Number(bpmControl.value);
    bpmOutput.value = String(bpm);
    applyBpm(bpm);
    mappingEpoch = performance.now();
});

resetButton.addEventListener("click", () => {
    allSliders.forEach((slider) => {
        slider.value = slider.dataset.default;
        updateSliderOutput(slider);
        if (slider.dataset.morph) setMorph(slider.dataset.morph, Number(slider.value));
    });
    textureSelect.value = "diffuse";
    textureSelect.dispatchEvent(new Event("change"));
    camera.position.copy(defaultCameraPosition);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    render();
});

addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    backgroundCamera.aspect = innerWidth / innerHeight;
    backgroundCamera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    controls.handleResize();
    render();
});

function setMorph(name, value) {
    morphMeshes.forEach((mesh) => {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = value;
    });
}

function updateSliderOutput(slider) {
    slider.previousElementSibling.querySelector("output").value = `${Math.round(Number(slider.value) * 100)}%`;
}

async function toggleAudio() {
    if (audioRunning) {
        await audioContext.suspend();
        audioRunning = false;
        audioToggle.dataset.state = "paused";
        audioToggle.textContent = "Start audio";
        audioToggle.classList.remove("playing");
        audioStatus.textContent = "Audio paused";
        return;
    }

    try {
        await startAudio();
    } catch (error) {
        console.error("Could not start RNBO audio", error);
        audioToggle.textContent = "Start audio";
        audioStatus.textContent = "Audio failed · check console";
    }
}

async function startAudio() {
    audioToggle.textContent = "Loading…";
    await initializeAudioEngine();
    await audioContext.resume();
    if (window.RNBO.TransportEvent) {
        rnboDevice.scheduleEvent(new window.RNBO.TransportEvent(window.RNBO.TimeNow, 1));
    }
    applyBpm(Number(bpmControl.value));
    audioRunning = true;
    audioToggle.dataset.state = "playing";
    audioToggle.textContent = "Pause audio";
    audioToggle.classList.add("playing");
    audioStatus.textContent = "Playing · BPM-random warps";
    if (!automationFrame) automationFrame = requestAnimationFrame(automationLoop);
}

function initializeAudioEngine() {
    if (audioInitPromise) return audioInitPromise;

    audioInitPromise = (async () => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();

        const patchResponse = await fetch("export/patch.export.json");
        if (!patchResponse.ok) throw new Error(`Patch export returned ${patchResponse.status}`);
        const patcher = await patchResponse.json();

        await loadRNBOScript(patcher.desc.meta.rnboversion);
        rnboDevice = await window.RNBO.createDevice({ context: audioContext, patcher });

        const outputGain = audioContext.createGain();
        outputGain.gain.value = 0.9;
        rnboDevice.node.connect(outputGain);
        outputGain.connect(audioContext.destination);

        const dependencyResponse = await fetch("export/dependencies.json");
        if (!dependencyResponse.ok) throw new Error(`Dependencies returned ${dependencyResponse.status}`);
        let dependencies = await dependencyResponse.json();
        dependencies = dependencies.map((dependency) => dependency.file
            ? { ...dependency, file: `export/${dependency.file}` }
            : dependency);
        const dependencyResults = await rnboDevice.loadDataBufferDependencies(dependencies);
        const failures = (dependencyResults || []).filter((result) => result.type !== "success");
        if (failures.length) {
            throw new Error(`${failures.length} sample dependencies failed to load`);
        }

        applyBpm(Number(bpmControl.value));
        audioStatus.textContent = `${dependencies.length} samples loaded`;
        audioToggle.dataset.samples = String(dependencies.length);
    })().catch((error) => {
        audioInitPromise = null;
        throw error;
    });

    return audioInitPromise;
}

function loadRNBOScript(version) {
    if (window.RNBO) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://cdn.cycling74.com/rnbo/${encodeURIComponent(version)}/rnbo.min.js`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load RNBO ${version}`));
        document.head.appendChild(script);
    });
}

function getBpmParameter() {
    if (!rnboDevice) return null;
    return rnboDevice.parametersById?.get("bpm")
        || rnboDevice.parameters?.find((parameter) => parameter.id === "bpm")
        || null;
}

function applyBpm(bpm) {
    const parameter = getBpmParameter();
    if (parameter) parameter.value = bpm;
    if (rnboDevice && window.RNBO?.TempoEvent) {
        rnboDevice.scheduleEvent(new window.RNBO.TempoEvent(window.RNBO.TimeNow, bpm));
    }
}

function regenerateMappings() {
    mappingGeneration += 1;
    randomizeButton.dataset.mappingGeneration = String(mappingGeneration);
    mappingEpoch = performance.now();

    morphMappings = morphSliders.map((slider, index) => {
        const name = slider.dataset.morph;
        const maximum = Number(slider.max);
        const prominent = prominentMorphs.has(name);
        const base = maximum * randomBetween(0, prominent ? 0.12 : 0.07);
        const span = maximum * randomBetween(
            prominent ? 0.34 : 0.06,
            prominent ? 0.92 : 0.30
        );
        const upper = Math.min(maximum, base + span);

        return {
            name,
            lower: base,
            upper,
            smoothing: randomBetween(prominent ? 0.055 : 0.035, prominent ? 0.18 : 0.11),
            division: [0.5, 1, 1, 2, 2, 4][Math.floor(Math.random() * 6)],
            current: index % 5 === 0 ? base : 0,
            target: base,
            lastStep: -1
        };
    });

    rebuildProceduralWorld();
}

function automationLoop(timestamp) {
    if (!audioRunning) {
        automationFrame = null;
        return;
    }

    updateRandomMorphs(timestamp);
    updateProceduralVisuals(timestamp);
    render();
    automationFrame = requestAnimationFrame(automationLoop);
}

function updateRandomMorphs(timestamp) {
    const beatDuration = 60000 / Number(bpmControl.value);
    const elapsed = timestamp - mappingEpoch;
    const beatStep = Math.floor(elapsed / beatDuration);
    if (beatStep !== visualBeatStep) {
        visualBeatStep = beatStep;
        visualBassTarget = Math.random();
        visualTrebleTarget = Math.random();
        if (beatStep > 0 && beatStep % 16 === 0) rebuildProceduralWorld();
    }

    morphMappings.forEach((mapping) => {
        const step = Math.floor(elapsed / (beatDuration * mapping.division));
        if (step !== mapping.lastStep) {
            mapping.lastStep = step;
            mapping.target = randomBetween(mapping.lower, mapping.upper);
        }
        mapping.current += (mapping.target - mapping.current) * mapping.smoothing;
        setMorph(mapping.name, mapping.current);
    });
}

function rebuildProceduralWorld() {
    disposeObject(proceduralRoot);
    proceduralRoot.clear();
    visualSystems = [];

    const palettes = [
        [0xff2957, 0x37ff8b, 0x5b4bff, 0xffd23f, 0x00d9ff],
        [0xff6b00, 0xf7ff00, 0x00ffea, 0xff00a8, 0x8a2bff],
        [0xffffff, 0xff1744, 0x00e5ff, 0xc6ff00, 0x651fff],
        [0xff4fd8, 0x72f1b8, 0xfff275, 0x6c5ce7, 0xff7b54],
        [0x00ff66, 0xff003c, 0x00a8ff, 0xffe600, 0xe100ff]
    ];
    visualPalette = palettes[Math.floor(Math.random() * palettes.length)];
    backgroundScene.background = new THREE.Color(visualPalette[Math.floor(Math.random() * visualPalette.length)])
        .multiplyScalar(randomBetween(0.018, 0.07));
    visualSpin = Math.random() < 0.5 ? -1 : 1;
    visualSymmetry = Math.floor(randomBetween(3, 13));

    const builders = [buildPolyhedronStorm, buildRitualRings, buildParticleVortex, buildLaserMandala];
    builders.sort(() => Math.random() - 0.5);
    const systemCount = Math.floor(randomBetween(2, 5));
    builders.slice(0, systemCount).forEach((build) => build());
    visualBeatStep = -1;
    render();
}

function buildPolyhedronStorm() {
    const geometries = [
        new THREE.IcosahedronGeometry(0.16, 0),
        new THREE.OctahedronGeometry(0.18, 0),
        new THREE.TetrahedronGeometry(0.2, 0),
        new THREE.BoxGeometry(0.22, 0.22, 0.22)
    ];
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    geometries.filter((item) => item !== geometry).forEach((item) => item.dispose());
    const count = Math.floor(randomBetween(70, 190));
    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: Math.random() < 0.48,
        transparent: true,
        opacity: randomBetween(0.35, 0.88),
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2 * visualSymmetry + randomBetween(-0.35, 0.35);
        const radius = randomBetween(1.3, 6.5);
        dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, randomBetween(-2.8, 1));
        const scale = randomBetween(0.35, 2.5) * (0.7 + radius * 0.08);
        dummy.scale.setScalar(scale);
        dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        mesh.setColorAt(index, new THREE.Color(visualPalette[index % visualPalette.length]));
    }
    proceduralRoot.add(mesh);
    visualSystems.push({ type: "storm", object: mesh, baseScale: randomBetween(0.85, 1.2), speed: randomBetween(0.08, 0.32) });
}

function buildRitualRings() {
    const group = new THREE.Group();
    const count = Math.floor(randomBetween(7, 22));
    for (let index = 0; index < count; index++) {
        const radius = 0.7 + index * randomBetween(0.17, 0.34);
        const geometry = new THREE.TorusGeometry(radius, randomBetween(0.008, 0.045), 5, Math.floor(randomBetween(24, 90)));
        const material = new THREE.MeshBasicMaterial({
            color: visualPalette[index % visualPalette.length],
            transparent: true,
            opacity: randomBetween(0.24, 0.9),
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = randomBetween(-0.65, 0.65);
        ring.rotation.y = randomBetween(-0.65, 0.65);
        ring.userData.phase = Math.random() * Math.PI * 2;
        group.add(ring);
    }
    group.position.z = randomBetween(-1.8, -0.3);
    proceduralRoot.add(group);
    visualSystems.push({ type: "rings", object: group, baseScale: randomBetween(0.75, 1.3), speed: randomBetween(0.15, 0.5) });
}

function buildParticleVortex() {
    const count = Math.floor(randomBetween(450, 1100));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
        const t = index / count;
        const angle = t * Math.PI * 2 * visualSymmetry + randomBetween(-0.3, 0.3);
        const radius = 0.45 + t * 6;
        positions[index * 3] = Math.cos(angle) * radius;
        positions[index * 3 + 1] = Math.sin(angle) * radius;
        positions[index * 3 + 2] = randomBetween(-2.5, 0.5);
        const color = new THREE.Color(visualPalette[index % visualPalette.length]);
        colors.set([color.r, color.g, color.b], index * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
        size: randomBetween(0.018, 0.075),
        vertexColors: true,
        transparent: true,
        opacity: randomBetween(0.5, 1),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, material);
    proceduralRoot.add(points);
    visualSystems.push({ type: "particles", object: points, baseSize: material.size, speed: randomBetween(0.08, 0.42) });
}

function buildLaserMandala() {
    const group = new THREE.Group();
    const rayCount = visualSymmetry * Math.floor(randomBetween(2, 6));
    for (let index = 0; index < rayCount; index++) {
        const angle = (index / rayCount) * Math.PI * 2;
        const inner = randomBetween(0.4, 1.3);
        const outer = randomBetween(3.2, 7.2);
        const points = [
            new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, 0),
            new THREE.Vector3(Math.cos(angle + randomBetween(-0.14, 0.14)) * outer, Math.sin(angle + randomBetween(-0.14, 0.14)) * outer, randomBetween(-1.5, 0))
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: visualPalette[index % visualPalette.length],
            transparent: true,
            opacity: randomBetween(0.2, 0.9),
            blending: THREE.AdditiveBlending
        });
        group.add(new THREE.Line(geometry, material));
    }
    proceduralRoot.add(group);
    visualSystems.push({ type: "lasers", object: group, baseScale: randomBetween(0.8, 1.25), speed: randomBetween(0.04, 0.2) });
}

function updateProceduralVisuals(timestamp) {
    visualBass += (visualBassTarget - visualBass) * 0.16;
    visualTreble += (visualTrebleTarget - visualTreble) * 0.22;
    const time = timestamp * 0.001;

    visualSystems.forEach((system, index) => {
        const phase = time * system.speed * visualSpin + index;
        const pulse = 1 + visualBass * randomBetween(0.08, 0.11);
        system.object.rotation.z = phase;
        system.object.rotation.x = Math.sin(phase * 0.7) * (0.08 + visualTreble * 0.2);

        if (system.type === "rings") {
            system.object.scale.setScalar(system.baseScale * pulse);
            system.object.children.forEach((ring, ringIndex) => {
                const wave = Math.sin(time * (1.4 + visualTreble * 7) + ring.userData.phase + ringIndex * 0.2);
                ring.scale.setScalar(1 + wave * (0.025 + visualBass * 0.13));
                ring.material.opacity = 0.18 + visualTreble * 0.72;
            });
        } else if (system.type === "particles") {
            system.object.material.size = system.baseSize * (1 + visualTreble * 3.8);
            system.object.scale.setScalar(1 + visualBass * 0.22);
        } else {
            system.object.scale.setScalar(system.baseScale * pulse);
            if (system.object.material) system.object.material.opacity = 0.28 + visualTreble * 0.62;
        }
    });
}

function disposeObject(object) {
    object.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material?.dispose();
    });
}

function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
}

function centreAndFrame(object) {
    const box = new THREE.Box3().setFromObject(object);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(centre);
    const distance = Math.max(size.x, size.y) * 1.55;
    camera.position.set(0, 0, distance);
    defaultCameraPosition.copy(camera.position);
    camera.near = distance / 100;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
}

function render() {
    controls.update();
    renderer.clear();
    renderer.render(backgroundScene, backgroundCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
}

render();
