document.addEventListener("DOMContentLoaded", () => {

    /* =========================================
       1. HERO CANVAS ANIMATION
    ========================================= */
    const canvas = document.getElementById("heroCanvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        let dots = [];
        const COUNT = 80;

        function resize() {
            canvas.width  = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        function initDots() {
            dots = [];
            for (let i = 0; i < COUNT; i++) {
                dots.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: Math.random() * 1.5 + 0.5,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3,
                    alpha: Math.random() * 0.5 + 0.2
                });
            }
        }

        function drawDots() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Connect nearby dots
            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const dx = dots[i].x - dots[j].x;
                    const dy = dots[i].y - dots[j].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(46, 204, 113, ${0.12 * (1 - dist/120)})`;
                        ctx.lineWidth = 0.6;
                        ctx.moveTo(dots[i].x, dots[i].y);
                        ctx.lineTo(dots[j].x, dots[j].y);
                        ctx.stroke();
                    }
                }
            }
            // Draw dots
            dots.forEach(d => {
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(46, 204, 113, ${d.alpha})`;
                ctx.fill();

                d.x += d.vx;
                d.y += d.vy;

                if (d.x < 0 || d.x > canvas.width)  d.vx *= -1;
                if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
            });

            requestAnimationFrame(drawDots);
        }

        resize();
        initDots();
        drawDots();

        let resizeTimer;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { resize(); initDots(); }, 200);
        });
    }

    /* =========================================
       2. TYPING ANIMATION
    ========================================= */
    const typingEl = document.getElementById("typing-text");
    const roles = ["Problem Solver", "Web Developer", "Competitive Programmer", "Creative Thinker"];
    let roleIndex = 0, charIndex = 0, isDeleting = false, delay = 150;

    function type() {
        if (!typingEl) return;
        const current = roles[roleIndex];
        typingEl.textContent = isDeleting
            ? current.substring(0, charIndex - 1)
            : current.substring(0, charIndex + 1);
        charIndex += isDeleting ? -1 : 1;
        delay = isDeleting ? 50 : 150;

        if (!isDeleting && charIndex === current.length) { isDeleting = true; delay = 2000; }
        else if (isDeleting && charIndex === 0) { isDeleting = false; roleIndex = (roleIndex + 1) % roles.length; delay = 400; }

        setTimeout(type, delay);
    }
    if (typingEl) setTimeout(type, 1200);

    /* =========================================
       3. NAVBAR: SCROLL + ACTIVE + HAMBURGER
    ========================================= */
    const navbar = document.getElementById("navbar");
    const hamburger = document.getElementById("hamburger");
    const navLinks = document.getElementById("navLinks");

    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) navbar.classList.add("scrolled");
        else navbar.classList.remove("scrolled");
        updateScrollProgress();
        updateActiveNav();
    }, { passive: true });

    if (hamburger && navLinks) {
        hamburger.addEventListener("click", () => {
            hamburger.classList.toggle("open");
            navLinks.classList.toggle("open");
        });
        navLinks.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                hamburger.classList.remove("open");
                navLinks.classList.remove("open");
            });
        });
    }

    function updateActiveNav() {
        const sections = document.querySelectorAll("section[id]");
        let current = "";
        sections.forEach(s => {
            if (window.scrollY + 120 >= s.offsetTop) current = s.id;
        });
        document.querySelectorAll(".nav-links a").forEach(a => {
            a.classList.toggle("active", a.getAttribute("href") === `#${current}`);
        });
    }

    /* =========================================
       4. SCROLL PROGRESS BAR
    ========================================= */
    const progressBar = document.getElementById("scrollProgress");
    function updateScrollProgress() {
        if (!progressBar) return;
        const total = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.width = `${(window.scrollY / total) * 100}%`;
    }

    /* =========================================
       5. INTERSECTION OBSERVER (Animations)
    ========================================= */
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                // Animate progress fills
                entry.target.querySelectorAll(".progress-fill").forEach(fill => {
                    fill.style.width = fill.getAttribute("data-width");
                });
                // Animate number counters
                entry.target.querySelectorAll("[data-count]").forEach(el => {
                    animateCount(el, parseInt(el.getAttribute("data-count")));
                });
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll(
        ".slide-up, .slide-right, .section-label, .fade-in-up"
    ).forEach(el => observer.observe(el));

    /* =========================================
       6. COUNTER ANIMATION
    ========================================= */
    function animateCount(el, target) {
        let start = 0;
        const duration = 1200;
        const step = timestamp => {
            if (!step.startTime) step.startTime = timestamp;
            const progress = Math.min((timestamp - step.startTime) / duration, 1);
            el.textContent = Math.floor(progress * target);
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target;
        };
        requestAnimationFrame(step);
    }

    /* =========================================
       7. LIVE API DATA
    ========================================= */
    // Codeforces
    fetch("https://codeforces.com/api/user.info?handles=YH_AM-IN")
        .then(r => r.json())
        .then(data => {
            if (data.status === "OK") {
                const user = data.result[0];
                const rating = user.rating ?? "N/A";
                const maxRating = user.maxRating ?? "N/A";
                const rank = (user.rank ?? "Unranked").replace(/\b\w/g, c => c.toUpperCase());

                const el = id => document.getElementById(id);
                if (el("cf-rating"))     el("cf-rating").textContent = rating;
                if (el("cf-max-rating")) el("cf-max-rating").textContent = maxRating;
                if (el("cf-rank"))       el("cf-rank").textContent = rank;
                if (el("cf-rating-hero")) {
                    el("cf-rating-hero").textContent = rating;
                    el("cf-rating-hero").removeAttribute("data-count");
                }
            }
        })
        .catch(() => {});

    // GitHub
    fetch("https://api.github.com/users/Yeamin-Talukder")
        .then(r => r.json())
        .then(data => {
            const el = id => document.getElementById(id);
            if (el("gh-repos"))       el("gh-repos").textContent = data.public_repos ?? "—";
            if (el("gh-followers"))   el("gh-followers").textContent = data.followers ?? "—";
            if (el("gh-repos-hero")) {
                el("gh-repos-hero").textContent = data.public_repos ?? "—";
                el("gh-repos-hero").removeAttribute("data-count");
            }
        })
        .catch(() => {});

});
