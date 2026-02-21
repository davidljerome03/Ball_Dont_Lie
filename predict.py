import os
import pandas as pd
import numpy as np
import joblib
from xgboost import XGBRegressor
from nba_api.stats.static import players

PROCESSED_DATA_DIR = "processed_data"
MASTER_FILE = os.path.join(PROCESSED_DATA_DIR, "master_dataset.parquet")
MODEL_FILE = os.path.join(PROCESSED_DATA_DIR, "xgb_pts_model.joblib")

def get_player_id(player_name):
    nba_players = players.get_players()
    # Try exact match first
    matched = [p for p in nba_players if p['full_name'].lower() == player_name.lower()]
    if matched:
        return matched[0]['id']
        
    # Try partial match if exact fails
    matched_partial = [p for p in nba_players if player_name.lower() in p['full_name'].lower()]
    if matched_partial:
        # Return the active one if possible
        for p in matched_partial:
            if p['is_active']:
                return p['id']
        # Fallback to the first match if none are active
        return matched_partial[0]['id']
        
    return None

import time
import random
from nba_api.stats.endpoints import playergamelog
from features import engineered_features_for_player

def get_headers():
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ]
    return {
        'Host': 'stats.nba.com',
        'User-Agent': random.choice(user_agents),
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://stats.nba.com/'
    }

from nba_api.stats.endpoints import leaguegamelog

def fetch_live_player_logs(player_id, season='2025-26'):
    print(f"Fetching live up-to-date data for player ID {player_id}...")
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # We use PlayerGameLog here specifically because pulling the entire LeagueGameLog
            # just to predict one player's next game is too heavy and causes 30-second timeouts.
            log = playergamelog.PlayerGameLog(
                player_id=player_id,
                season=season, 
                headers=get_headers(), 
                timeout=15
            )
            df = log.get_data_frames()[0]
            
            # Ensure column naming matches the league schema exactly
            df.columns = df.columns.str.upper()
            
            # Add missing 'PLAYER_ID' column if the endpoint omitted it
            if 'PLAYER_ID' not in df.columns:
                df['PLAYER_ID'] = player_id
                
            return df
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(1) # Quick retry
            else:
                print("Live NBA API is rate-limiting. Instantly loading up-to-date local cache instead.")
                
    return None

def load_latest_features(player_id, master_df):
    """
    Get the most recent games for the player, fetch live data, and generate features 
    for the UPCOMING game.
    """
    # 1. Fetch live data for current season to get games missed by the last full ingestion
    live_logs = fetch_live_player_logs(player_id)
    
    # 2. Get the player's historical raw logs directly
    nba_players = players.get_players()
    matched = [p for p in nba_players if p['id'] == player_id]
    p_name = matched[0]['full_name'].replace(' ', '_') if matched else "Unknown"
    
    raw_file = os.path.join("data", f"{p_name}_{player_id}_logs.parquet")
    if os.path.exists(raw_file):
        raw_df = pd.read_parquet(raw_file)
    else:
        print("Warning: Could not find raw historical game logs. Using only live data.")
        raw_df = pd.DataFrame()
        
    # 3. Combine historical raw with live raw
    if live_logs is not None and not live_logs.empty:
        combined_raw = pd.concat([raw_df, live_logs], ignore_index=True)
        # Sort and drop duplicates robustly based on standard GAME_ID
        combined_raw = combined_raw.drop_duplicates(subset=['GAME_ID'], keep='last')
    else:
        combined_raw = raw_df
        
    if combined_raw.empty:
        return None
        
    # Sort chronologically before appending dummy row
    combined_raw['GAME_DATE'] = pd.to_datetime(combined_raw['GAME_DATE'])
    combined_raw = combined_raw.sort_values('GAME_DATE').reset_index(drop=True)
    
    # 4. Create a dummy "Upcoming Game" row. 
    # This forces features.py to calculate trailing averages (PTS_3g_avg, etc) 
    # that correctly include the most recent game!
    dummy_row = combined_raw.iloc[-1:].copy()
    dummy_row['GAME_ID'] = 'COMING_SOON'
    # Set date to tomorrow relative to their last game
    dummy_row['GAME_DATE'] = combined_raw['GAME_DATE'].iloc[-1] + pd.Timedelta(days=1)
    dummy_row['MATCHUP'] = 'LAL vs. LAL' # Neutral default
    
    combined_raw = pd.concat([combined_raw, dummy_row], ignore_index=True)

    print(f"Engineering features across {len(combined_raw)-1} historical games for next prediction...")
    
    # 5. Run feature engineering on the combined dataset
    engineered_df = engineered_features_for_player(combined_raw)
    
    # 6. Extract the dummy row (which now contains the accurate shifting averages)
    engineered_df = engineered_df.sort_values('GAME_DATE')
    latest_game = engineered_df.iloc[-1].copy()
    
    # Extract only needed features
    features = [
        'PTS_3g_avg', 'PTS_5g_avg', 'PTS_10g_avg',
        'B2B_FLAG', 'GAMES_LAST_7D',
        'ALTITUDE', 'HIGH_ALTITUDE_FLAG',
        'TRAVEL_DIST'
    ]
    
    feat_dict = {}
    for f in features:
        feat_dict[f] = latest_game.get(f, 0)
        
    # Handle the dummy columns that the model expects
    travel_dir = latest_game.get('TRAVEL_DIR', 'None')
    tz_shift = latest_game.get('TZ_SHIFT', '0')
    
    feat_dict[f'TRAVEL_DIR_{travel_dir}'] = 1
    feat_dict[f'TZ_SHIFT_{tz_shift}'] = 1
    
    return pd.DataFrame([feat_dict])


def train_and_save_model():
    """
    Trains the XGBoost model on all data and saves it to disk for quick predictions.
    """
    print("Training production model on complete dataset...")
    df = pd.read_parquet(MASTER_FILE)
    
    # This logic matches model.py prep_for_modeling
    cols_to_check = ['PTS', 'PTS_3g_avg', 'PTS_5g_avg', 'PTS_10g_avg']
    df_clean = df.dropna(subset=cols_to_check).copy()
    df_clean = pd.get_dummies(df_clean, columns=['TRAVEL_DIR', 'TZ_SHIFT'], drop_first=True)
    
    features = ['PTS_3g_avg', 'PTS_5g_avg', 'PTS_10g_avg', 'B2B_FLAG', 'GAMES_LAST_7D', 'ALTITUDE', 'HIGH_ALTITUDE_FLAG', 'TRAVEL_DIST']
    for col in df_clean.columns:
        if col.startswith('TRAVEL_DIR_') or col.startswith('TZ_SHIFT_'):
            features.append(col)
            
    df_clean = df_clean.dropna(subset=features)
    
    X = df_clean[features]
    y = df_clean['PTS']
    
    model = XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42, n_jobs=-1)
    model.fit(X, y)
    
    # Save the model and the expected feature columns
    joblib.dump({'model': model, 'features': features}, MODEL_FILE)
    print(f"Model saved to {MODEL_FILE}")
    return model, features

def predict_player_points(player_name):
    # Load data
    if not os.path.exists(MASTER_FILE):
        print(f"File {MASTER_FILE} not found. You must run main.py first to build the dataset.")
        return
        
    df = pd.read_parquet(MASTER_FILE)
    # Apply dummy encoding immediately so load_latest_features can find them
    df = pd.get_dummies(df, columns=['TRAVEL_DIR', 'TZ_SHIFT'], drop_first=True)
    
    # Find player
    player_id = get_player_id(player_name)
    if not player_id:
        print(f"Could not find exact match for player: {player_name}")
        return
        
    # Try to load model, if it doesn't exist, train it
    if os.path.exists(MODEL_FILE):
        print("Loading existing model...")
        saved_data = joblib.load(MODEL_FILE)
        model = saved_data['model']
        expected_features = saved_data['features']
    else:
        model, expected_features = train_and_save_model()
        
    # Get player's latest features
    X_pred = load_latest_features(player_id, df)
    
    if X_pred is None:
        print(f"No valid historical data found for {player_name} to base a prediction on.")
        return
        
    # Ensure columns match what the model was trained on
    # Add missing dummy columns with 0
    for col in expected_features:
        if col not in X_pred.columns:
            X_pred[col] = 0
            
    # Order columns exactly as the model expects
    X_pred = X_pred[expected_features]
    
    # Predict
    prediction = model.predict(X_pred)[0]
    
    # Get their baseline (last 5 game average) for comparison
    baseline = X_pred['PTS_5g_avg'].iloc[0]
    
    print("\n" + "="*50)
    print(f" PREDICTION FOR: {player_name.upper()}")
    print("="*50)
    print(f" Baseline (Last 5 Games Avg): {baseline:.1f} PTS")
    print(f" XGBoost Model Prediction:    {prediction:.1f} PTS")
    print("="*50 + "\n")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        player = " ".join(sys.argv[1:])
        predict_player_points(player)
    else:
        print("Usage: python predict.py \"Player Name\"")
        print("Example: python predict.py \"LeBron James\"")
