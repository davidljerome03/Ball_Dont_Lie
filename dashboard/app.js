document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

let gamesData = [];
let projectionsData = [];
let currentFilter = 'today';
let currentProjStat = 'PTS';
let searchQuery = '';

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
            renderGames();
        });
    });

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

    // Sort games chronologically by tip-off time
    filteredGames.sort((a, b) => {
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

    gamesList.innerHTML = filteredGames.slice(0, 15).map(g => {
        const isToday = g.GAME_DATE === todayStr;
        return `
            <div class="game-card">
                <div class="team home">
                    <div class="team-name">${g.HOME_TEAM}</div>
                    <div class="team-role">★ Home</div>
                </div>
                <div class="match-info">
                    <div class="time-badge" style="${!isToday ? 'background: var(--accent-blue);' : ''}">${isToday ? 'Tonight' : g.GAME_DATE}<br/><small style="opacity: 0.8">${g.GAME_TIME}</small></div>
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

function renderProjectionList(container, limit) {
    if (!container) return;

    const statCol = `PREDICTED_${currentProjStat}`;

    // Ensure players have data for this stat
    let validPlayers = projectionsData.filter(p => !isNaN(parseFloat(p[statCol])));

    if (searchQuery) {
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

        if (currentProjStat === 'PTS') {
            primaryVal = pPts; primaryLabel = 'PTS';
            microStats = [{ l: 'REB', v: pReb }, { l: 'AST', v: pAst }, { l: 'PRA', v: pPra }];
        } else if (currentProjStat === 'REB') {
            primaryVal = pReb; primaryLabel = 'REB';
            microStats = [{ l: 'PTS', v: pPts }, { l: 'AST', v: pAst }, { l: 'PRA', v: pPra }];
        } else if (currentProjStat === 'AST') {
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
                    <div class="stat-secondary" style="color: ${currentProjStat === 'PTS' ? diffColor : 'var(--text-secondary)'}">
                        ${currentProjStat === 'PTS' ? (diff == 0 ? 'Avg Match' : `${diffText} proj diff`) : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
