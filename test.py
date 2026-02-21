'''from nba_api.stats.static import players

player_dirct = players.get_players()'''

from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats
import time

# 1. Define custom headers to look like a real browser
custom_headers = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://stats.nba.com/',
    'Connection': 'keep-alive',
}

# 2. Find the player
nba_players = players.get_players()
lebron = [p for p in nba_players if p['full_name'] == 'LeBron James'][0]

try:
    # 3. Pass the headers and a longer timeout (60 seconds)
    career = playercareerstats.PlayerCareerStats(
        player_id=lebron['id'], 
        headers=custom_headers, 
        timeout=60
    )
    
    df = career.get_data_frames()[0]
    print(df[['SEASON_ID', 'TEAM_ABBREVIATION', 'PTS']].tail())

except Exception as e:
    print(f"Still hitting a wall: {e}")
    print("\nPRO-TIP: If you're still timing out in Codespaces, the NBA might be blocking the GitHub IP range.")
    print("Try running this script locally on your laptop using the venue Wi-Fi or your hotspot.")