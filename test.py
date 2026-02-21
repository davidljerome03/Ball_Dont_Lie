from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats
import pandas as pd

# 1. Reuse the headers to avoid timeouts
custom_headers = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
    'Referer': 'https://stats.nba.com/',
}

# 2. Get LeBron's ID
nba_players = players.get_players()

lebron = [p for p in nba_players if p['full_name'] == 'LeBron James'][0]

print(lebron)

try:
    # 3. Pull all career stats
    career = playercareerstats.PlayerCareerStats(
        player_id=lebron['id'], 
        headers=custom_headers, 
        timeout=60
    )
    
    # 4. Filter for the 2025-26 season
    df = career.get_data_frames()[0]

    ##print(len(df))
    ##print(df.shape)
    ##print(df.columns)

    current_season_stats = df[df['SEASON_ID'] == '2025-26']

    if not current_season_stats.empty:
        # Select key stats for a clean print
        stats_to_show = ['SEASON_ID', 'TEAM_ABBREVIATION', 'GP', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG_PCT']
        print("--- LeBron James: Current Season Stats (2025-26) ---")
        print(current_season_stats[stats_to_show].to_string(index=False))
    else:
        print("Stats for 2025-26 not found yet. Showing most recent season instead:")
        print(df.tail(1))

except Exception as e:
    print(f"Error: {e}")