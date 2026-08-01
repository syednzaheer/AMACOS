// Three.js Neural Intelligence Background for AMACOS
// Plug-and-play. No HTML or CSS changes required.

class CoreEngine {
    constructor() {
        this.container = document.getElementById('three-canvas-container');
        if (!this.container || !window.THREE) return;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            60,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 18);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });

        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        this.initLights();
        this.createNeuralNetwork();
        this.animate();

        window.addEventListener('resize', () => this.onResize());
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambient);

        const key = new THREE.PointLight(0x7c3e2e, 2.5, 80);
        key.position.set(10, 10, 10);
        this.scene.add(key);

        const rim = new THREE.PointLight(0xffa07a, 1.2, 60);
        rim.position.set(-10, -6, -8);
        this.scene.add(rim);
    }

    createNeuralNetwork() {
        this.network = new THREE.Group();
        this.scene.add(this.network);

        this.nodes = [];
        this.lines = [];

        const NODE_COUNT = 42;
        const RADIUS = 7;

        const nodeMaterial = new THREE.MeshPhongMaterial({
            color: 0x7c3e2e,
            emissive: 0x7c3e2e,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.85
        });

        // Nodes
        for (let i = 0; i < NODE_COUNT; i++) {
            const geometry = new THREE.SphereGeometry(0.12, 16, 16);
            const node = new THREE.Mesh(geometry, nodeMaterial);

            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;

            node.position.set(
                RADIUS * Math.sin(phi) * Math.cos(theta),
                RADIUS * Math.sin(phi) * Math.sin(theta),
                RADIUS * Math.cos(phi)
            );

            node.userData = {
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random()
            };

            this.nodes.push(node);
            this.network.add(node);
        }

        // Connections
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x7c3e2e,
            transparent: true,
            opacity: 0.25
        });

        for (let i = 0; i < NODE_COUNT; i++) {
            for (let j = i + 1; j < NODE_COUNT; j++) {
                if (Math.random() > 0.92) {
                    const points = [
                        this.nodes[i].position,
                        this.nodes[j].position
                    ];
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const line = new THREE.Line(geometry, lineMaterial);
                    this.lines.push(line);
                    this.network.add(line);
                }
            }
        }

        // Central Core (Intelligence Hub)
        const coreGeo = new THREE.SphereGeometry(0.9, 32, 32);
        const coreMat = new THREE.MeshPhongMaterial({
            color: 0x7c3e2e,
            emissive: 0x7c3e2e,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 0.35
        });

        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.network.add(this.core);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const t = this.clock.getElapsedTime();

        // Network rotation (slow, premium)
        this.network.rotation.y += 0.0012;
        this.network.rotation.x += 0.0006;

        // Node pulsing
        this.nodes.forEach(node => {
            const scale = 1 + Math.sin(t * node.userData.speed + node.userData.phase) * 0.25;
            node.scale.set(scale, scale, scale);
        });

        // Core breathing
        const coreScale = 1 + Math.sin(t * 2) * 0.08;
        this.core.scale.set(coreScale, coreScale, coreScale);

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CoreEngine();
});
