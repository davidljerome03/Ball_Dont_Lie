import os
import time
import datetime
import pandas as pd
from nba_api.stats.endpoints import scoreboardv2
from nba_api.stats.static import teams

DATA_DIR = "data"

def fetch_remaining_schedule(start_date=None, end_date=None):
    """
    Fetches the remaining NBA schedule using the ScoreboardV2 endpoint.
    It iterates day by day to avoid massive payloads that might timeout or get blocked.
    """
    if start_date is None:
        # Start from today
        start_date = datetime.date.today()
    
    if end_date is None:
        # End of regular season is roughly mid-April
        end_date = datetime.date(start_date.year, 4, 15)

    print(f"Fetching schedule from {start_date} to {end_date}...")
    
    # Get team ID to Abbreviation mapping
    nba_teams = teams.get_teams()
    id_to_abbr = {team['id']: team['abbreviation'] for team in nba_teams}

    all_games = []
    current_date = start_date
    
    # We will track empty days to break early if season ends
    empty_days_in_a_row = 0
    max_empty_days = 10 # if 10 days straight have no games, we assume season is over

    while current_date <= end_date:
        date_str = current_date.strftime('%Y-%m-%d')
        
        try:
            # Sleep to strictly respect rate limits and avoid timeouts (as requested)
            time.sleep(1.0)
            
            sb = scoreboardv2.ScoreboardV2(game_date=date_str, timeout=60)
            df = sb.get_data_frames()[0]
            
            if df.empty:
                empty_days_in_a_row += 1
                if empty_days_in_a_row >= max_empty_days:
                    print(f"No games found for {max_empty_days} consecutive days. Ending fetch early.")
                    break
            else:
                empty_days_in_a_row = 0
                # Process the games
                for _, row in df.iterrows():
                    home_id = row['HOME_TEAM_ID']
                    away_id = row['VISITOR_TEAM_ID']
                    
                    # Sometimes placeholder teams (like All-Star) won't map
                    home_team = id_to_abbr.get(home_id, f"Unknown_{home_id}")
                    away_team = id_to_abbr.get(away_id, f"Unknown_{away_id}")
                    
                    game = {
                        'GAME_DATE': current_date.strftime('%Y-%m-%d'),
                        'GAME_TIME': row.get('GAME_STATUS_TEXT', 'TBD'),
                        'GAME_ID': row['GAME_ID'],
                        'HOME_TEAM': home_team,
                        'AWAY_TEAM': away_team,
                        # Matchup strings formatted as expected by features.py
                        'MATCHUP_HOME': f"{home_team} vs. {away_team}",
                        'MATCHUP_AWAY': f"{away_team} @ {home_team}"
                    }
                    all_games.append(game)
                
                print(f"Found {len(df)} games on {date_str}")
                
        except Exception as e:
            print(f"Error fetching games for {date_str}: {e}")
            time.sleep(5.0) # wait longer on error
            
        current_date += datetime.timedelta(days=1)
        
    if not all_games:
        print("No upcoming games found.")
        return None
        
    schedule_df = pd.DataFrame(all_games)
    
    # Save the full upcoming schedule
    out_path = os.path.join(DATA_DIR, "upcoming_games.csv")
    schedule_df.to_csv(out_path, index=False)
    print(f"\nSuccessfully saved {len(schedule_df)} remaining games to {out_path}!")
    
    return schedule_df

if __name__ == "__main__":
    fetch_remaining_schedule()
