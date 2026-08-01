/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                  AMACOS LANDING PAGE INTERACTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ───────────────────────────────────────────────────────────────────────────
 * 
 * This script orchestrates the dynamic, living interface experience:
 * - Scroll-triggered reveal animations using Intersection Observer
 * - Parallax-style mouse tracking for hero visual
 * - Smooth, performant animations for premium feel
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────
// Scroll Animation Observer (Stitch Interaction Design)
// ─────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 1. Intersection Observer for Scroll Reveals
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.scroll-reveal, .kinetic-lift').forEach(el => observer.observe(el));

    // 2. Typography Reveal Engine (Split Character Animation)
    const title = document.getElementById('split-target');
    if (title) {
        const text = title.textContent;
        const highlightWord = "Thinks";
        const highlightIndex = text.indexOf(highlightWord);

        title.innerHTML = '';
        [...text].forEach((char, i) => {
            const span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.style.display = 'inline-block';
            span.style.opacity = '0';
            span.style.transform = 'translateY(20px)';
            span.style.transition = `all 0.6s cubic-bezier(0.23, 1, 0.32, 1) ${i * 0.03}s`;

            // Highlight characters that belong to the target word
            if (highlightIndex !== -1 && i >= highlightIndex && i < highlightIndex + highlightWord.length) {
                span.classList.add('highlight');
            }

            title.appendChild(span);
            // Trigger animation
            setTimeout(() => {
                span.style.opacity = '1';
                span.style.transform = 'translateY(0)';
            }, 100);
        });
    }

    // 3. Realistic 3D Tilt Engine (GPU Accelerated & Throttled)
    const tiltCards = document.querySelectorAll('.card, .agent-card');

    tiltCards.forEach(card => {
        let rafId;

        const handleTilt = (e) => {
            if (rafId) cancelAnimationFrame(rafId);

            rafId = requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // Max 12 degrees for premium, dramatic feel
                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });
        };

        card.addEventListener('mousemove', handleTilt);

        card.addEventListener('mouseleave', () => {
            if (rafId) cancelAnimationFrame(rafId);
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    });

    // 4. Parallax Ambient Blobs (Scroll-based, not mouse-following)
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const blobs = document.querySelectorAll('.blob');
        blobs.forEach((blob, i) => {
            const speed = 0.05 + (i * 0.02);
            blob.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });

    // 5. Neural Particle System
    const canvas = document.getElementById('particle-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        class Particle {
            constructor() {
                this.init();
            }
            init() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2;
                this.color = '#7C3E2E';
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = 0.3;
                ctx.fill();
            }
        }

        for (let i = 0; i < 80; i++) particles.push(new Particle());

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            requestAnimationFrame(animate);
        }
        animate();
    }
});
