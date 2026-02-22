document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

let gamesData = [];
let projectionsData = [];
let currentFilter = 'today';

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
        Papa.parse('../data/upcoming_games.csv', {
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
        Papa.parse('../data/upcoming_projections.csv', {
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
        return dates[0] || new Date().toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
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
            <h3>Schedules</h3>
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

    gamesList.innerHTML = filteredGames.slice(0, 15).map(g => {
        const isToday = g.GAME_DATE === todayStr;
        return `
            <div class="game-card">
                <div class="team home">
                    <div class="team-name">${g.HOME_TEAM}</div>
                    <div class="team-role">★ Home</div>
                </div>
                <div class="match-info">
                    <div class="time-badge" style="${!isToday ? 'background: var(--accent-blue);' : ''}">${isToday ? 'Tonight' : g.GAME_DATE}</div>
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
    const playersList = document.getElementById('players-list');
    
    const validPlayers = projectionsData.filter(p => !isNaN(parseFloat(p.PREDICTED_PTS)));
    validPlayers.sort((a, b) => parseFloat(b.PREDICTED_PTS) - parseFloat(a.PREDICTED_PTS));
    
    // We only show top 10 players to keep UI clean
    const topPlayers = validPlayers.slice(0, 10);

    if (topPlayers.length === 0) {
        playersList.innerHTML = `<p class="loading-state">No projections found.</p>`;
        return;
    }

    playersList.innerHTML = topPlayers.map(p => {
        const pPts = parseFloat(p.PREDICTED_PTS).toFixed(1);
        const pReb = parseFloat(p.PREDICTED_REB).toFixed(1);
        const pAst = parseFloat(p.PREDICTED_AST).toFixed(1);
        const pPra = parseFloat(p.PREDICTED_PRA).toFixed(1);
        const baseline = p.BASELINE_5G_PTS ? parseFloat(p.BASELINE_5G_PTS).toFixed(1) : pPts;
        
        const diff = (pPts - baseline).toFixed(1);
        const diffColor = diff > 0 ? 'var(--accent-green)' : (diff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const diffText = diff > 0 ? `+${diff}` : diff;

        return `
            <div class="player-card">
                <div class="player-info">
                    <h4>${p.PLAYER_NAME}</h4>
                    <p>${p.TEAM} vs ${p.OPPONENT}</p>
                    <div class="stat-grid">
                        <div class="micro-stat">REB<strong>${pReb}</strong></div>
                        <div class="micro-stat">AST<strong>${pAst}</strong></div>
                        <div class="micro-stat">PRA<strong>${pPra}</strong></div>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-primary">${pPts} PTS</div>
                    <div class="stat-secondary" style="color: ${diffColor}">
                        ${diff == 0 ? 'Avg Match' : `${diffText} proj diff`}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
