/**
 * Ambient Background Engine
 * 
 * Creates a subtle floating particle effect to make the dashboard feel alive
 * without distracting the user from the data.
 */

const canvas = document.getElementById("bg-engine");

// If the canvas isn't there, don't crash the script. Just stop.
if (!canvas) {
    console.warn("Background canvas 'bg-engine' not found. Animation skipped.");
} else {
    const ctx = canvas.getContext("2d");

    // Configuration - Tweaked for a calm, professional look.
    const CONFIG = {
        particleCount: 70,      // Enough to look busy, not enough to lag.
        particleSize: 1.6,      // Subtle dots.
        speed: 0.3,             // Slow drift.
        color: "rgba(124, 62, 46, 0.9)" // Branded reddish-brown.
    };

    let w, h;

    // Resize handler ensures the background always fills the screen.
    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }

    window.addEventListener("resize", resize);
    resize(); // Trigger once on load.

    // Initialize particles with random positions and velocities.
    const dots = Array.from({ length: CONFIG.particleCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * CONFIG.speed,
        vy: (Math.random() - 0.5) * CONFIG.speed
    }));

    // The main animation loop.
    function animate() {
        ctx.clearRect(0, 0, w, h);

        dots.forEach(d => {
            d.x += d.vx;
            d.y += d.vy;

            // Bounce off edges to keep them on screen.
            if (d.x < 0 || d.x > w) d.vx *= -1;
            if (d.y < 0 || d.y > h) d.vy *= -1;

            ctx.beginPath();
            ctx.arc(d.x, d.y, CONFIG.particleSize, 0, Math.PI * 2);
            ctx.fillStyle = CONFIG.color;
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }

    animate();
}
