import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import shap
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.model_selection import train_test_split

PROCESSED_DATA_DIR = "processed_data"
MASTER_FILE = os.path.join(PROCESSED_DATA_DIR, "master_dataset.parquet")

def load_data():
    if not os.path.exists(MASTER_FILE):
        print(f"File {MASTER_FILE} not found. Run features.py first.")
        return None
    return pd.read_parquet(MASTER_FILE)

def prep_for_modeling(df, target_col='PTS'):
    # Drop rows where target is NaN or rolling averages are NaN
    # The first few games for any player will have NaN for 3g/5g/10g avgs
    cols_to_check = [target_col, f'{target_col}_3g_avg', f'{target_col}_5g_avg', f'{target_col}_10g_avg']
    df_clean = df.dropna(subset=cols_to_check).copy()
    
    # We also need to map categorical text columns (e.g., TRAVEL_DIR, TZ_SHIFT) to dummies or drop
    df_clean = pd.get_dummies(df_clean, columns=['TRAVEL_DIR', 'TZ_SHIFT'], drop_first=True)
    
    features = [
        f'{target_col}_3g_avg', f'{target_col}_5g_avg', f'{target_col}_10g_avg',
        'B2B_FLAG', 'GAMES_LAST_7D',
        'ALTITUDE', 'HIGH_ALTITUDE_FLAG',
        'TRAVEL_DIST'
    ]
    
    # Add dummy columns that were generated
    for col in df_clean.columns:
        if col.startswith('TRAVEL_DIR_') or col.startswith('TZ_SHIFT_'):
            features.append(col)
            
    # Ensure all features handle NaNs (e.g., from first games without prev lag)
    df_clean = df_clean.dropna(subset=features)
    
    X = df_clean[features].astype(float)
    y = df_clean[target_col].astype(float)
    
    # Baseline projection: let's use the 5-game rolling average as our naive baseline
    baseline_preds = df_clean[f'{target_col}_5g_avg']
    
    return X, y, baseline_preds

def train_and_evaluate(target='PTS'):
    print(f"--- Training Model for Target: {target} ---")
    df = load_data()
    if df is None: return
    
    X, y, baseline_preds = prep_for_modeling(df, target_col=target)
    
    if len(X) < 100:
        print("Not enough data to train.")
        return
        
    # Temporal or random split. For MVP we can just do a random split, 
    # but temporal is safer against leakage. We'll stick to a simple train_test_split.
    X_train, X_test, y_train, y_test, base_train, base_test = train_test_split(
        X, y, baseline_preds, test_size=0.2, random_state=42
    )
    
    print(f"Training shapes -> X: {X_train.shape}, y: {y_train.shape}")
    
    # Baseline Metrics
    base_rmse = np.sqrt(mean_squared_error(y_test, base_test))
    base_mae = mean_absolute_error(y_test, base_test)
    
    # 1. Random Forest Regressor
    rf_model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
    rf_model.fit(X_train, y_train)
    rf_preds = rf_model.predict(X_test)
    
    rf_rmse = np.sqrt(mean_squared_error(y_test, rf_preds))
    rf_mae = mean_absolute_error(y_test, rf_preds)
    
    # 2. XGBoost Regressor (Stretch goal)
    xgb_model = XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42, n_jobs=-1)
    xgb_model.fit(X_train, y_train)
    xgb_preds = xgb_model.predict(X_test)
    
    xgb_rmse = np.sqrt(mean_squared_error(y_test, xgb_preds))
    xgb_mae = mean_absolute_error(y_test, xgb_preds)
    
    print("\n--- Evaluation Metrics vs Baseline ---")
    print(f"Baseline (5g avg) -> MAE: {base_mae:.2f} | RMSE: {base_rmse:.2f}")
    print(f"Random Forest     -> MAE: {rf_mae:.2f} | RMSE: {rf_rmse:.2f}")
    print(f"XGBoost           -> MAE: {xgb_mae:.2f} | RMSE: {xgb_rmse:.2f}")
    
    improvement_rf = ((base_mae - rf_mae) / base_mae) * 100
    improvement_xgb = ((base_mae - xgb_mae) / base_mae) * 100
    print(f"\nImprovement over Baseline MAE: RF = {improvement_rf:.1f}%, XGB = {improvement_xgb:.1f}%")
    
    # SHAP visualizer
    print("\nGenerating SHAP summary plot for XGBoost model...")
    try:
        explainer = shap.Explainer(xgb_model, X_train)
        shap_values = explainer(X_test)
        
        plt.figure(figsize=(10, 8))
        shap.summary_plot(shap_values, X_test, feature_names=X_test.columns, show=False)
        plot_path = f"shap_summary_{target}.png"
        plt.savefig(plot_path, bbox_inches='tight')
        plt.close()
        print(f"Saved SHAP summary plot to {plot_path}")
    except Exception as e:
        print(f"Error generating SHAP plot: {e}")

if __name__ == "__main__":
    train_and_evaluate(target='PTS')
