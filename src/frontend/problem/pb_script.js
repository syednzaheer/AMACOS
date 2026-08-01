/**
 * AMACOS Problem Submission Form
 *
 * Handles the multi-modal complaint submission interface: canvas background,
 * mode switching (text/image/video), drag-and-drop uploads, input validation,
 * and the POST to /process_complaint.
 *
 * v2 fix: submissions used to report "success" in the UI even when the
 * backend rejected them or the request failed outright, silently falling
 * back to localStorage without telling the person their report never
 * reached the server. Real failures now show a real error state instead.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Canvas Background Logic ---
    const canvas = document.getElementById('hero-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        const particleCount = 100; // Increased
        const connectionDistance = 160; // Increased range
        const mouseDistance = 220; // More reactive

        let w, h;
        const mouse = { x: null, y: null };

        window.addEventListener('mousemove', (e) => {
            mouse.x = e.x;
            mouse.y = e.y;
        });

        window.addEventListener('resize', resize);

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
            initParticles();
        }

        class Particle {
            constructor() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 3 + 1.5; // Larger particles
                this.color = '#7C3E2E';
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > w) this.vx *= -1;
                if (this.y < 0 || this.y > h) this.vy *= -1;

                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouseDistance) {
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (mouseDistance - distance) / mouseDistance;
                    const directionX = forceDirectionX * force * 2;
                    const directionY = forceDirectionY * force * 2;
                    this.x -= directionX;
                    this.y -= directionY;
                }
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => { p.update(); p.draw(); });
            connectParticles();
            requestAnimationFrame(animate);
        }

        function connectParticles() {
            for (let a = 0; a < particles.length; a++) {
                for (let b = a; b < particles.length; b++) {
                    const dx = particles[a].x - particles[b].x;
                    const dy = particles[a].y - particles[b].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        const opacityValue = 1 - (distance / connectionDistance);
                        ctx.strokeStyle = `rgba(124, 62, 46, ${opacityValue * 0.5})`; // More visible lines
                        ctx.lineWidth = 1.2; // Slightly thicker lines
                        ctx.beginPath();
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }
            }
        }
        resize();
        animate();
    }

    // --- Page Entrance Animation ---
    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        setTimeout(() => {
            mainContainer.classList.add('active');
        }, 100);
    }

    // --- Tabs Logic ---
    const modeBtns = document.querySelectorAll('.mode-btn');
    const inputSections = document.querySelectorAll('.input-section');

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            inputSections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            document.getElementById(`input-${mode}`).classList.add('active');
        });
    });

    // --- Image Upload Logic ---
    const dropZoneImage = document.getElementById('drop-zone-image');
    const fileInputImage = document.getElementById('file-image');
    const imagePreview = document.getElementById('image-preview');

    dropZoneImage.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        fileInputImage.click();
    });

    fileInputImage.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload a valid image file.');
                fileInputImage.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                dropZoneImage.classList.add('has-file');
            };
            reader.readAsDataURL(file);
        }
    });

    // Make available globally for inline onclick
    window.clearImage = () => {
        fileInputImage.value = '';
        imagePreview.src = '';
        dropZoneImage.classList.remove('has-file');
    };

    // --- Video Upload Logic ---
    const dropZoneVideo = document.getElementById('drop-zone-video');
    const fileInputVideo = document.getElementById('file-video');
    const videoFilename = document.getElementById('video-filename');

    dropZoneVideo.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        fileInputVideo.click();
    });

    fileInputVideo.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('video/')) {
                alert('Please upload a valid video file.');
                fileInputVideo.value = '';
                return;
            }
            videoFilename.textContent = file.name;
            dropZoneVideo.classList.add('has-file');
        }
    });

    // Make available globally
    window.clearVideo = () => {
        fileInputVideo.value = '';
        videoFilename.textContent = '';
        dropZoneVideo.classList.remove('has-file');
    };

    // --- User Detail Validation ---
    const nameInput = document.getElementById('user-name');
    const rollInput = document.getElementById('user-roll');
    // Kept in sync with src/backend/core/sanitize.js on the server. Client-side
    // validation is for instant feedback only - the server never trusts this.
    const namePattern = /^[a-zA-Z][a-zA-Z\s.'-]{1,79}$/;
    const rollPattern = /^[a-zA-Z0-9\/-]{3,20}$/;
    nameInput.maxLength = 80;
    rollInput.maxLength = 20;
    document.getElementById('problem-text').maxLength = 2000;

    function triggerErrorFeedback(input) {
        input.classList.add('invalid');
        input.parentElement.classList.add('shake-animation');
        setTimeout(() => {
            input.parentElement.classList.remove('shake-animation');
            input.classList.remove('invalid');
        }, 400);
    }

    function validateInput(input, pattern) {
        if (!pattern.test(input.value)) {
            input.classList.add('invalid');
            return false;
        } else {
            input.classList.remove('invalid');
            return true;
        }
    }

    nameInput.addEventListener('input', (e) => {
        const original = e.target.value;
        const cleaned = original.replace(/[^a-zA-Z\s]/g, '');
        if (original !== cleaned) {
            e.target.value = cleaned;
            triggerErrorFeedback(nameInput);
        } else {
            validateInput(nameInput, namePattern);
        }
    });

    rollInput.addEventListener('input', (e) => {
        const original = e.target.value;
        const cleaned = original.replace(/[^a-zA-Z0-9\/-]/g, '');
        if (original !== cleaned) {
            e.target.value = cleaned;
            triggerErrorFeedback(rollInput);
        } else {
            validateInput(rollInput, rollPattern);
        }
    });

    // --- Enter Key Submission Support ---
    [nameInput, rollInput, document.getElementById('problem-text')].forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (input.tagName === 'TEXTAREA') {
                    if (e.shiftKey) {
                        // Allow Shift+Enter for new lines in textarea
                        return;
                    }
                }
                e.preventDefault();
                submitBtn.focus(); // Visual feedback
                submitBtn.click();
            }
        });
    });

    // --- Submit Button Logic ---
    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.innerHTML;

    submitBtn.addEventListener('click', async () => {
        const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
        const name = nameInput.value.trim();
        const roll = rollInput.value.trim();
        let content = '';

        let isProblemEmpty = false;
        let isDetailsEmpty = false;

        if (!name) {
            nameInput.classList.add('invalid');
            nameInput.parentElement.classList.add('shake-animation');
            isDetailsEmpty = true;
        }
        if (!roll) {
            rollInput.classList.add('invalid');
            rollInput.parentElement.classList.add('shake-animation');
            isDetailsEmpty = true;
        }

        if (activeMode === 'text') {
            content = document.getElementById('problem-text').value.trim();
            if (!content) isProblemEmpty = true;
        } else if (activeMode === 'image') {
            if (!fileInputImage.files.length) {
                isProblemEmpty = true;
            } else {
                content = `[IMAGE] ${fileInputImage.files[0].name}`;
            }
        } else if (activeMode === 'video') {
            if (!fileInputVideo.files.length) {
                isProblemEmpty = true;
            } else {
                content = `[VIDEO] ${fileInputVideo.files[0].name}`;
            }
        }

        setTimeout(() => {
            document.querySelectorAll('.shake-animation').forEach(el => el.classList.remove('shake-animation'));
        }, 400);

        if (isProblemEmpty || isDetailsEmpty) {
            submitBtn.style.animation = 'shake 0.5s';
            setTimeout(() => submitBtn.style.animation = '', 500);
            return;
        }

        submitBtn.innerHTML = '<span class="material-icons-round spin">sync</span> Sending...';
        submitBtn.style.opacity = '0.8';
        submitBtn.style.pointerEvents = 'none';

        // Only the 4 fields the server actually trusts. No client-generated id,
        // timestamp, or status - the server derives all of those itself, and a
        // client that could set its own "status: submitted" is a client that
        // could later claim "status: resolved" without anyone ever resolving it.
        const payload = { name, roll, type: activeMode, content };

        const resetButtonAfterDelay = () => {
            setTimeout(() => {
                submitBtn.classList.remove('success', 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'all';
                document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
            }, 2500);
        };

        const handleSuccess = () => {
            submitBtn.classList.add('success');
            const btnText = submitBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.style.opacity = '0';
                setTimeout(() => {
                    submitBtn.innerHTML = '<span class="material-icons-round">check_circle</span> <span class="btn-text">Problem reported successfully</span>';
                    submitBtn.querySelector('.btn-text').style.opacity = '1';
                }, 300);
            } else {
                submitBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Problem reported successfully';
            }

            resetButtonAfterDelay();

            // Reset form only on confirmed success - not on failure, so the
            // person doesn't lose what they typed if the submission was rejected.
            document.getElementById('problem-text').value = '';
            nameInput.value = '';
            rollInput.value = '';
            window.clearImage();
            window.clearVideo();
        };

        // Shown for a REAL failure: validation rejection, spam filter, rate limit,
        // or network error. This used to be masked and reported as success -
        // that was the bug. A person needs to know if their report didn't land.
        const handleFailure = (message) => {
            submitBtn.classList.add('error');
            submitBtn.innerHTML = `<span class="material-icons-round">error</span> <span class="btn-text">${message}</span>`;
            resetButtonAfterDelay();
        };

        try {
            const isNoBackend = window.location.protocol === 'file:';

            if (isNoBackend) {
                // Genuinely no server available (opened the HTML file directly, not
                // via `npm start`). This is an honest offline demo mode, labeled as such.
                try {
                    const existingProblems = JSON.parse(localStorage.getItem('amacos_offline_queue') || '[]');
                    existingProblems.push({ ...payload, queuedAt: new Date().toISOString() });
                    localStorage.setItem('amacos_offline_queue', JSON.stringify(existingProblems));
                    setTimeout(() => {
                        submitBtn.classList.add('success');
                        submitBtn.innerHTML = '<span class="material-icons-round">cloud_off</span> Saved locally (offline demo mode - no server running)';
                        resetButtonAfterDelay();
                    }, 400);
                } catch (e) {
                    handleFailure('Could not save locally. Please try again.');
                }
                return;
            }

            const response = await fetch('/process_complaint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                handleSuccess();
                return;
            }

            let details = 'Submission was rejected. Please check your details and try again.';
            try {
                const errBody = await response.json();
                if (errBody?.details) details = errBody.details;
                else if (errBody?.error) details = errBody.error;
            } catch (_) { /* response wasn't JSON - use default message */ }

            if (response.status === 429) details = 'Too many submissions - please wait a moment before trying again.';

            handleFailure(details);
        } catch (error) {
            console.error('Submission error:', error);
            handleFailure('Network error - could not reach the server. Please try again.');
        }
    });

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes shake {
            0% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            50% { transform: translateX(5px); }
            75% { transform: translateX(-5px); }
            100% { transform: translateX(0); }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(styleSheet);
});
