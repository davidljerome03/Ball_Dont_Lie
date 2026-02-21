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

def fetch_live_player_logs(player_id, season='2025-26'):
    print(f"Fetching live up-to-date data for player ID {player_id}...")
    try:
        logs = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=season,
            headers=get_headers(),
            timeout=30
        ).get_data_frames()[0]
        return logs
    except Exception as e:
        print(f"Warning: Failed to fetch live data from API: {e}")
        return None

def load_latest_features(player_id, master_df):
    """
    Get the most recent game for the player, including fetching live data from the API
    to ensure we have every game up to today. 
    """
    # 1. Get historical data from master DF
    player_history = master_df[master_df['PLAYER_ID'] == player_id].copy()
    
    # 2. Fetch live data for current season to get games missed by the last full ingestion
    live_logs = fetch_live_player_logs(player_id)
    
    # 3. Combine them. To ensure rolling averages calculate correctly, we need the raw logs 
    # before feature engineering. But master_df is already engineered.
    # Therefore we will pull the raw parquet for the player if it exists.
    
    player_name = nba_players = players.get_players()
    matched = [p for p in nba_players if p['id'] == player_id]
    p_name = matched[0]['full_name'].replace(' ', '_') if matched else "Unknown"
    
    raw_file = os.path.join("data", f"{p_name}_{player_id}_logs.parquet")
    if os.path.exists(raw_file):
        raw_df = pd.read_parquet(raw_file)
    else:
        print("Warning: Could not find raw historical game logs. Using only live data for features.")
        raw_df = pd.DataFrame()
        
    # Combine historical raw with live raw
    if live_logs is not None and not live_logs.empty:
        combined_raw = pd.concat([raw_df, live_logs], ignore_index=True)
        # Drop duplicates in case live data overlaps with historical data
        combined_raw = combined_raw.drop_duplicates(subset=['GAME_ID'], keep='last')
    else:
        combined_raw = raw_df
        
    if combined_raw.empty:
        return None
        
    print(f"Engineering features across {len(combined_raw)} total career/season games...")
    
    # 4. Run feature engineering on the combined raw dataset
    engineered_df = engineered_features_for_player(combined_raw)
    
    # 5. Get the very last row
    engineered_df = engineered_df.sort_values('GAME_DATE')
    latest_game = engineered_df.iloc[-1].copy()
    
    # Extract only needed features
    features = [
        'PTS_3g_avg', 'PTS_5g_avg', 'PTS_10g_avg',
        'B2B_FLAG', 'GAMES_LAST_7D',
        'ALTITUDE', 'HIGH_ALTITUDE_FLAG',
        'TRAVEL_DIST'
    ]
    
    # Convert categorical to dummies conceptually for this single row
    # We will just manually set them or extract them if they exist
    feat_dict = {}
    for f in features:
        feat_dict[f] = latest_game.get(f, 0)
        
    # Handle the dummy columns that the model expects (e.g. TRAVEL_DIR_Westward, TZ_SHIFT_1)
    # The engineered dataframe has "TRAVEL_DIR" and "TZ_SHIFT" as categorical strings currently
    travel_dir = latest_game.get('TRAVEL_DIR', 'None')
    tz_shift = latest_game.get('TZ_SHIFT', '0')
    
    # We will initialize all possible dummy columns to 0 later in predict_player_points,
    # but we need to set the *active* one to 1 here.
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
