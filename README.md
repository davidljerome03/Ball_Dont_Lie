# Ball Don't Lie: NBA Analytics & Projections Dashboard 🏀

**Ball Don't Lie** is a complete, end-to-end Machine Learning pipeline and interactive frontend dashboard designed to predict daily NBA player performance. The application automatically pulls live schedules, generates historical engineering features, and utilizes trained models (like XGBoost) to output highly accurate projections for Points (PTS), Rebounds (REB), Assists (AST), and PRA (Points + Rebounds + Assists).

It features a heavily customized, premium UI built with vanilla HTML/CSS/JS that runs directly off of static CSV files—requiring no heavy backend servers to browse the data!

---

## What Does It Do?
1. **Automated Scheduling**: Automatically fetches today's games and the upcoming schedule via the official NBA API.
2. **Prop Projections**: Runs thousands of historical match-ups through our ML predictors to spit out estimated individual player stat lines. 
3. **Mismatch Detection**: Highlights the differential between a player's recent 5-game baseline and their expected performance tonight (noting massive expected improvements or drop-offs).
4. **Interactive Dashboard**: A responsive, sortable frontend UI complete with Dark Mode, quick-search, team-specific dynamic color themes, and a "Top 5" animated slideshow.

---

## File Overview

### ⚙️ The Data & ML Backend
* `fetch_schedule.py`: Fetches the active NBA schedule day-by-day using the `scoreboardv2` API, cleans the data, removes duplicates, and saves the matches to `data/upcoming_games.csv`.
* `features.py`: The data engineering engine. It calculates advanced rolling metrics (last 5 games, usage rates, opponent defensive ratings, days of rest) required by the ML models to make accurate predictions.
* `predict.py`: Holds the core prediction algorithms. It loads in our saved `.joblib` model weights and processes the generated features to output accurate PTS, REB, AST, and PRA numbers.
* `prepare_projections.py`: The main orchestration script. Running this single file triggers the schedule fetch, calculates the features, runs the predictions, and exports everything into the final `data/upcoming_projections.csv` that fuels the website.

### 🎨 The Frontend Dashboard (`/dashboard`)
* `index.html`: The structural foundation of the dashboard. Contains the layout for the navigation, metrics grid, schedule list, and projections table.
* `styles.css`: A massive, entirely custom stylesheet featuring modern glassmorphism, fluid responsive layouts, CSS variables for effortless Light/Dark mode toggling, and dynamic team-specific gradient injections.
* `app.js`: The brain of the UI. It uses PapaParse to read the static CSV data locally and populates the DOM. It also manages state (search filtering, stats sorting, page pagination, the Top 5 slideshow interval, and saving user theme preferences to `localStorage`).

### 📁 Directories
* `data/`: Contains the generated CSV files (`upcoming_games.csv`, `upcoming_projections.csv`, etc.) that act as the static database for the frontend app.
* `models/`: Stores the serialized, pre-trained Machine Learning models (like `xgb_pts_model.joblib`) used by `predict.py`.

---

## How to Run
1. Make sure you have python installed along with dependencies like `pandas`, `xgboost`, `scikit-learn`, and `nba_api`.
2. Run `python prepare_projections.py` to pull today's data and update the CSVs.
3. Start a local server to view the frontend: `python -m http.server 8000`
4. Open your browser and navigate to `http://localhost:8000/dashboard/`.