from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats
import pandas as pd
import time

# 1. Reuse the headers to avoid timeouts
custom_headers = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
    'Referer': 'https://stats.nba.com/',
}


nba_players = players.get_players()

active_players = [p for p in nba_players if p['is_active']]

active_players.sort(key=lambda x: x['full_name'])

for p in active_players:
    print(p['full_name'])


