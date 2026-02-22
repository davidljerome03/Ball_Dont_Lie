document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

let gamesData = [];
let projectionsData = [];
let currentFilter = 'today';
let currentProjStat = 'PTS';
let searchQuery = '';

// Pagination State
let currentGamesPage = 1;
const GAMES_PER_PAGE = 5;
let gameSearchQuery = '';

// Slideshow State
const slideshowCategories = ['PTS', 'REB', 'AST', 'PRA'];
let currentSlideIndex = 0;
let slideshowInterval = null;

async function initDashboard() {
    try {
        await Promise.all([
            loadGames(),
            loadProjections()
        ]);

        setupEventListeners();
        renderDashboard();
    } catch (err) {
        console.error("Error loading dashboard data:", err);
        document.getElementById('metrics-grid').innerHTML = `<p class="loading-state">Failed to load data. Ensure local node server is running.</p>`;
    }
}

async function loadGames() {
    return new Promise((resolve, reject) => {
        Papa.parse('../data/upcoming_games.csv?v=' + new Date().getTime(), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Filter out Unknown_None games
                gamesData = results.data.filter(g => g.HOME_TEAM !== 'Unknown_None');
                resolve();
            },
            error: reject
        });
    });
}

async function loadProjections() {
    return new Promise((resolve, reject) => {
        Papa.parse('../data/upcoming_projections.csv?v=' + new Date().getTime(), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                projectionsData = results.data;
                resolve();
            },
            error: reject
        });
    });
}

function setupEventListeners() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            currentGamesPage = 1; // Reset page on tab switch
            renderGames();
        });
    });

    // Pagination Listeners
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentGamesPage > 1) {
                currentGamesPage--;
                renderGames();
            }
        });
        nextBtn.addEventListener('click', () => {
            currentGamesPage++;
            renderGames();
        });
    }

    // Games Search Filter
    const gameSearchInput = document.getElementById('game-search');
    if (gameSearchInput) {
        gameSearchInput.addEventListener('input', (e) => {
            gameSearchQuery = e.target.value.toLowerCase();
            currentGamesPage = 1; // reset page on search
            renderGames();
        });
    }

    // SPA Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-target');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Projections Stat Filter
    const filterSelect = document.getElementById('full-proj-stat-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentProjStat = e.target.value;
            renderProjections();
        });
    }

    // Player Search Filter
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderProjections();
        });
    }
}

function renderDashboard() {
    renderMetrics();
    renderGames();
    renderProjections();
    startSlideshow();
}

// Dynamically pick the earliest date that has games as "Today"
function getEarliestDate() {
    if (gamesData.length > 0) {
        const dates = gamesData.map(g => g.GAME_DATE).filter(d => d);
        dates.sort();
        return dates[0];
    }

    // Fallback if no games exist (timezone safe)
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today - tzOffset).toISOString().split('T')[0];
}

function renderMetrics() {
    const todayStr = getEarliestDate();

    // 1. Games Today
    const gamesToday = gamesData.filter(g => g.GAME_DATE === todayStr).length;

    // 2. Upcoming Scheduled
    const upcomingGames = gamesData.filter(g => g.GAME_DATE > todayStr).length;

    // Clean projections
    const validProjections = projectionsData.filter(p => !isNaN(parseFloat(p.PREDICTED_PTS)));

    // 3. Top Projected Scorer
    const scorers = [...validProjections].sort((a, b) => parseFloat(b.PREDICTED_PTS) - parseFloat(a.PREDICTED_PTS));
    const topScorer = scorers.length > 0 ? scorers[0] : null;

    // 4. Top Projected PRA
    const praLeaders = [...validProjections].filter(p => !isNaN(parseFloat(p.PREDICTED_PRA))).sort((a, b) => parseFloat(b.PREDICTED_PRA) - parseFloat(a.PREDICTED_PRA));
    const topPra = praLeaders.length > 0 ? praLeaders[0] : null;

    const metricsGrid = document.getElementById('metrics-grid');
    metricsGrid.innerHTML = `
        <div class="metric-card">
            <div class="metric-icon">👥</div>
            <h3>Scheduled Games</h3>
            <div class="value">${gamesToday}</div>
            <div class="subtext">Games on ${todayStr}</div>
        </div>
        <div class="metric-card green">
            <div class="metric-icon">📅</div>
            <h3>Upcoming Matches</h3>
            <div class="value">${upcomingGames}</div>
            <div class="subtext">Total Scheduled Games</div>
        </div>
        <div class="metric-card purple">
            <div class="metric-icon">🔥</div>
            <h3>Top Proj. Scorer</h3>
            <div class="value" style="font-size: 1.6rem; padding-top: 0.5rem;">${topScorer ? topScorer.PLAYER_NAME : 'N/A'}</div>
            <div class="subtext">${topScorer ? parseFloat(topScorer.PREDICTED_PTS).toFixed(1) + ' PTS (' + topScorer.TEAM + ')' : '--'}</div>
        </div>
        <div class="metric-card orange">
            <div class="metric-icon">⚡</div>
            <h3>Top Overall (PRA)</h3>
            <div class="value" style="font-size: 1.6rem; padding-top: 0.5rem;">${topPra ? topPra.PLAYER_NAME : 'N/A'}</div>
            <div class="subtext">${topPra ? parseFloat(topPra.PREDICTED_PRA).toFixed(1) + ' PRA (' + topPra.TEAM + ')' : '--'}</div>
        </div>
    `;
}

function renderGames() {
    const todayStr = getEarliestDate();
    const gamesList = document.getElementById('games-list');
    const subtitle = document.getElementById('schedule-subtitle');

    let filteredGames = [];
    if (currentFilter === 'today') {
        filteredGames = gamesData.filter(g => g.GAME_DATE === todayStr);
        subtitle.textContent = `${todayStr} • ${filteredGames.length} games scheduled`;
    } else {
        filteredGames = gamesData.filter(g => g.GAME_DATE > todayStr);
        subtitle.textContent = `Upcoming Schedule • ${filteredGames.length} games scheduled`;
    }

    if (filteredGames.length === 0) {
        gamesList.innerHTML = `<p class="loading-state">No games found.</p>`;
        return;
    }

    // Filter by Search Query
    if (gameSearchQuery) {
        filteredGames = filteredGames.filter(g =>
            g.HOME_TEAM.toLowerCase().includes(gameSearchQuery) ||
            g.AWAY_TEAM.toLowerCase().includes(gameSearchQuery) ||
            `${g.HOME_TEAM} vs ${g.AWAY_TEAM}`.toLowerCase().includes(gameSearchQuery) ||
            `${g.AWAY_TEAM} @ ${g.HOME_TEAM}`.toLowerCase().includes(gameSearchQuery)
        );
    }

    // Sort games chronologically by date first, then by tip-off time
    filteredGames.sort((a, b) => {
        if (a.GAME_DATE !== b.GAME_DATE) {
            return a.GAME_DATE.localeCompare(b.GAME_DATE);
        }

        const parseTime = (timeStr) => {
            if (!timeStr || timeStr === 'TBD' || timeStr.includes('undefined')) return 2400;
            let match = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i);
            if (!match) return 2400;
            let hours = parseInt(match[1]);
            let mins = parseInt(match[2]);
            let ampm = match[3].toLowerCase();
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            return hours * 60 + mins;
        };
        return parseTime(a.GAME_TIME) - parseTime(b.GAME_TIME);
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredGames.length / GAMES_PER_PAGE);
    if (currentGamesPage > totalPages && totalPages > 0) {
        currentGamesPage = totalPages;
    }

    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageIndicator = document.getElementById('page-indicator');

    if (prevBtn && nextBtn && pageIndicator) {
        prevBtn.disabled = currentGamesPage <= 1;
        nextBtn.disabled = currentGamesPage >= totalPages;
        pageIndicator.textContent = `${totalPages > 0 ? currentGamesPage : 0} / ${totalPages}`;
    }

    const startIndex = (currentGamesPage - 1) * GAMES_PER_PAGE;
    const paginatedGames = filteredGames.slice(startIndex, startIndex + GAMES_PER_PAGE);

    gamesList.innerHTML = paginatedGames.map(g => {
        const isToday = g.GAME_DATE === todayStr;
        return `
            <div class="game-card">
                <div class="team home">
                    <div class="team-name">${g.HOME_TEAM}</div>
                    <div class="team-role">★ Home</div>
                </div>
                <div class="match-info">
                    <div class="time-badge" style="padding: 0.5rem 1rem; ${!isToday ? 'background: var(--accent-blue);' : ''}">
                        <div style="font-size: 1.1rem; font-weight: bold;">${g.GAME_TIME}</div>
                        <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 0.1rem;">${g.GAME_DATE}</div>
                    </div>
                    <div class="vs">VS</div>
                </div>
                <div class="team away">
                    <div class="team-name">${g.AWAY_TEAM}</div>
                    <div class="team-role">Away ↗</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProjections() {
    renderProjectionList(document.getElementById('full-players-list'), 100);
}

function renderProjectionList(container, limit, overrideStat = null) {
    if (!container) return;

    const activeStat = overrideStat || currentProjStat;
    const statCol = `PREDICTED_${activeStat}`;

    // Ensure players have data for this stat
    let validPlayers = projectionsData.filter(p => !isNaN(parseFloat(p[statCol])));

    if (searchQuery && !overrideStat) { // Don't filter slideshow by search
        validPlayers = validPlayers.filter(p => p.PLAYER_NAME.toLowerCase().includes(searchQuery));
    }

    validPlayers.sort((a, b) => parseFloat(b[statCol]) - parseFloat(a[statCol]));

    const topPlayers = validPlayers.slice(0, limit);

    if (topPlayers.length === 0) {
        container.innerHTML = `<p class="loading-state">No projections found.</p>`;
        return;
    }

    container.innerHTML = topPlayers.map(p => {
        const pPts = parseFloat(p.PREDICTED_PTS).toFixed(1);
        const pReb = parseFloat(p.PREDICTED_REB).toFixed(1);
        const pAst = parseFloat(p.PREDICTED_AST).toFixed(1);
        const pPra = parseFloat(p.PREDICTED_PRA).toFixed(1);

        let primaryVal = 0, primaryLabel = '';
        let microStats = [];

        if (activeStat === 'PTS') {
            primaryVal = pPts; primaryLabel = 'PTS';
            microStats = [{ l: 'REB', v: pReb }, { l: 'AST', v: pAst }, { l: 'PRA', v: pPra }];
        } else if (activeStat === 'REB') {
            primaryVal = pReb; primaryLabel = 'REB';
            microStats = [{ l: 'PTS', v: pPts }, { l: 'AST', v: pAst }, { l: 'PRA', v: pPra }];
        } else if (activeStat === 'AST') {
            primaryVal = pAst; primaryLabel = 'AST';
            microStats = [{ l: 'PTS', v: pPts }, { l: 'REB', v: pReb }, { l: 'PRA', v: pPra }];
        } else {
            primaryVal = pPra; primaryLabel = 'PRA';
            microStats = [{ l: 'PTS', v: pPts }, { l: 'REB', v: pReb }, { l: 'AST', v: pAst }];
        }

        const baseline = p.BASELINE_5G_PTS ? parseFloat(p.BASELINE_5G_PTS).toFixed(1) : pPts;
        const diff = (parseFloat(p.PREDICTED_PTS) - baseline).toFixed(1);
        const diffColor = diff > 0 ? 'var(--accent-green)' : (diff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const diffText = diff > 0 ? `+${diff}` : diff;

        const microHtml = microStats.map(m => `<div class="micro-stat">${m.l}<strong>${m.v}</strong></div>`).join('');

        return `
            <div class="player-card">
                <div class="player-info">
                    <h4>${p.PLAYER_NAME}</h4>
                    <p>${p.TEAM} vs ${p.OPPONENT}</p>
                    <div class="stat-grid">
                        ${microHtml}
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-primary">${primaryVal} ${primaryLabel}</div>
                    <div class="stat-secondary" style="color: ${activeStat === 'PTS' ? diffColor : 'var(--text-secondary)'}">
                        ${activeStat === 'PTS' ? (diff == 0 ? 'Avg Match' : `${diffText} proj diff`) : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// --- Slideshow Logic ---
function startSlideshow() {
    if (slideshowInterval) clearInterval(slideshowInterval);
    renderSlideshowTick();
    slideshowInterval = setInterval(() => {
        currentSlideIndex = (currentSlideIndex + 1) % slideshowCategories.length;
        renderSlideshowTick();
    }, 5000); // Rotate every 5 seconds
}

function renderSlideshowTick() {
    const listEl = document.getElementById('slideshow-players-list');
    const titleEl = document.getElementById('slideshow-title');
    const progressEl = document.getElementById('slideshow-progress');

    if (!listEl || !titleEl) return;

    const stat = slideshowCategories[currentSlideIndex];
    let label = stat;
    if (stat === 'PTS') label = 'Points (PTS)';
    if (stat === 'REB') label = 'Rebounds (REB)';
    if (stat === 'AST') label = 'Assists (AST)';
    if (stat === 'PRA') label = 'PRA';

    // Fade out
    listEl.style.opacity = '0';
    listEl.style.transform = 'translateY(5px)';

    // Reset progress bar animation
    if (progressEl) {
        progressEl.style.transition = 'none';
        progressEl.style.width = '0%';
    }

    setTimeout(() => {
        // Update Title & DOM
        titleEl.innerHTML = `Top 5 Projected <span>${label}</span>`;
        renderProjectionList(listEl, 5, stat);

        // Fade in
        listEl.style.opacity = '1';
        listEl.style.transform = 'translateY(0)';

        // Start progress bar animation
        if (progressEl) {
            // Force reflow to ensure transition runs from 0
            progressEl.offsetHeight;
            progressEl.style.transition = 'width 5s linear';
            progressEl.style.width = '100%';
        }
    }, 400); // 400ms CSS transition
}
