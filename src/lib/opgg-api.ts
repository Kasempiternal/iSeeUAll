/**
 * OP.GG API Integration using MCP Server
 * Handles player stats, match history, and boosting detection
 */

export interface PlayerStats {
  summonerName: string;
  gameTag: string;
  region: string;
  tier: string;
  rank: string;
  lp: number;
  winRate: number;
  wins: number;
  losses: number;
  level: number;
  profileIconId: number;
}

export interface MatchData {
  matchId: string;
  championId: number;
  championName: string;
  queueId: number;
  gameMode: string;
  gameType: string;
  gameCreation: number;
  gameDuration: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  summoner1Id: number; // Flash position (D or F key)
  summoner2Id: number; // Other summoner spell
  items: number[];
  wardsPlaced: number;
  wardsKilled: number;
  visionScore: number;
  totalMinionsKilled: number;
  goldEarned: number;
  damageDealtToChampions: number;
}

export interface PlayerAnalysis {
  playerStats: PlayerStats;
  recentMatches: MatchData[];
  boostedFlags: {
    flashPositionChanged: boolean;
    flashChangeCount: number;
    recentPerformanceDrop: boolean;
    suspiciousWinrateSpike: boolean;
    inconsistentPlaystyle: boolean;
  };
  performanceFlags: {
    isFeeding: boolean; // >10 deaths in recent games
    poorKDA: boolean; // <1.0 KDA average
    lowVisionScore: boolean;
    inconsistentCS: boolean;
  };
  riskScore: number; // 0-100, higher = more suspicious
}

export class OpggApiClient {
  private baseUrl = 'https://mcp-api.op.gg/mcp';
  private rateLimitDelay = 1000; // 1 second between requests
  private lastRequestTime = 0;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Rate-limited request function
   */
  private async makeRequest(endpoint: string, params: any = {}): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }

    const cacheKey = `${endpoint}-${JSON.stringify(params)}`;
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData && (now - cachedData.timestamp) < this.cacheTimeout) {
      return cachedData.data;
    }

    try {
      // Since we're in a Tauri app, we'll need to use Tauri's fetch or HTTP client
      // This is a placeholder for the actual MCP API call
      const response = await this.callMCPFunction(endpoint, params);
      
      this.lastRequestTime = Date.now();
      this.cache.set(cacheKey, { data: response, timestamp: now });
      
      return response;
    } catch (error) {
      // console.error(`OP.GG API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Call MCP function using Tauri's backend HTTP client
   */
  private async callMCPFunction(functionName: string, params: any): Promise<any> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    
    try {
      const result = await invoke("call_opgg_api", {
        functionName,
        params
      });
      return result;
    } catch (error) {
      // console.error(`MCP API call failed for ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * OP.GG MCP returns a { content: [{ type: 'text', text: 'json-string' }, ...] }
   * Parse the first JSON table payload into headers + rows
   */
  private parseMcpTable(result: any): { headers: string[]; rows: any[][] } | null {
    // console.log('[MCP] parseMcpTable called with result:', result);
    if (!result) {
      // console.log('[MCP] parseMcpTable: result is null/undefined');
      return null;
    }
    const content = (result as any).content;
    // console.log('[MCP] parseMcpTable: content:', content);
    if (!Array.isArray(content)) {
      // console.log('[MCP] parseMcpTable: content is not an array');
      return null;
    }
    for (const c of content) {
      // console.log('[MCP] parseMcpTable: processing content item:', c);
      if (c && c.type === 'text' && typeof c.text === 'string') {
        try {
          // console.log('[MCP] parseMcpTable: parsing text:', c.text.substring(0, 200) + '...');
          const parsed = JSON.parse(c.text);
          // console.log('[MCP] parseMcpTable: parsed successfully:', parsed);
          if (parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) {
            // console.log('[MCP] parseMcpTable: returning valid table with', parsed.headers.length, 'headers and', parsed.rows.length, 'rows');
            return { headers: parsed.headers, rows: parsed.rows };
          } else {
            // console.log('[MCP] parseMcpTable: parsed object missing headers or rows');
          }
        } catch (e) {
          // console.log('[MCP] parseMcpTable: JSON parse failed:', e);
          continue;
        }
      } else {
        // console.log('[MCP] parseMcpTable: content item invalid type/structure');
      }
    }
    // console.log('[MCP] parseMcpTable: no valid content found, returning null');
    return null;
  }

  private roman(div: number | null | undefined): string {
    const map: Record<number, string> = {1:'I',2:'II',3:'III',4:'IV'};
    return div && map[div] ? map[div] : '';
  }

  private normalizePlayerStats(raw: PlayerStats): PlayerStats {
    const normTier = (raw.tier || '').toUpperCase();
    const tier = (normTier === '' || normTier === 'NA' || normTier === 'NONE') ? 'UNRANKED' : normTier;
    const normRank = (raw.rank || '').toUpperCase();
    const rank = (normRank === 'NA' || normRank === 'NONE') ? '' : normRank;
    const region = (raw.region || 'euw').toLowerCase();
    return {
      ...raw,
      tier,
      rank,
      region
    };
  }

  /**
   * Search for summoner by game name and tag
   */
  async searchSummoner(gameName: string, gameTag: string, region: string = 'na1'): Promise<PlayerStats | null> {
    // Force EUW for now
    region = 'euw';
    try {
      // console.log(`[MCP] Searching for summoner: ${gameName}#${gameTag} in region ${region}`);
      
      // Try multiple parameter formats for the lol-summoner-search tool
      const parameterFormats = [
        // Format 1: Standard parameters
        {
          game_name: gameName,
          tag_line: gameTag,
          region: 'EUW'
        },
        // Format 2: Alternative naming
        {
          gameName: gameName,
          gameTag: gameTag,
          region: 'EUW'
        },
        // Format 3: Riot ID format
        {
          riotId: `${gameName}#${gameTag}`,
          region: 'EUW'
        },
        // Format 4: Simple format
        {
          summoner: gameName,
          tag: gameTag,
          region: 'EUW'
        }
      ];

      let lastError = null;
      
      for (const [index, params] of parameterFormats.entries()) {
        try {
          // console.log(`[MCP] Trying parameter format ${index + 1}:`, params);
          
          const result = await this.callMCPFunction('lol-summoner-search', params);
          // console.log(`[MCP] Raw result from format ${index + 1}:`, result);
          
          // Try different result parsing approaches
          if (result) {
            // Approach 1: Direct object result
            if (result.tier || result.rank || result.level) {
              // console.log(`[MCP] Found direct object result`);
              return this.parseDirectSummonerResult(result, gameName, gameTag, region);
            }
            
            // Approach 2: Table format
            const table = this.parseMcpTable(result);
            if (table) {
              // console.log(`[MCP] Found table format result`);
              const tableResult = this.parseTableSummonerResult(table, gameName, gameTag, region);
              // console.log(`[MCP] parseTableSummonerResult returned:`, tableResult);
              return tableResult;
            }
            
            // Approach 3: Nested content
            if (result.content || result.data) {
              // console.log(`[MCP] Found nested content result`);
              const nested = result.content || result.data;
              return this.parseNestedSummonerResult(nested, gameName, gameTag, region);
            }
            
            // console.log(`[MCP] Format ${index + 1} returned unparseable result`);
          }
        } catch (error) {
          // console.warn(`[MCP] Parameter format ${index + 1} failed:`, error);
          lastError = error;
          continue;
        }
      }
      
      throw lastError || new Error('All parameter formats failed');
    } catch (error) {
      // console.error('[MCP] Failed to search summoner:', error);
      return null;
    }
  }

  private parseDirectSummonerResult(result: any, gameName: string, gameTag: string, region: string): PlayerStats | null {
    try {
      const tier = (result.tier || result.rank || 'UNRANKED').toString().toUpperCase();
      const rank = result.division || result.rank_division || '';
      const lp = Number(result.lp || result.leaguePoints || 0);
      const wins = Number(result.wins || 0);
      const losses = Number(result.losses || 0);
      const level = Number(result.level || result.summonerLevel || 1);
      const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

      return this.normalizePlayerStats({
        summonerName: gameName,
        gameTag,
        region,
        tier,
        rank,
        lp,
        winRate,
        wins,
        losses,
        level,
        profileIconId: Number(result.profileIconId || 0)
      });
    } catch (error) {
      // console.error('[MCP] Failed to parse direct summoner result:', error);
      return null;
    }
  }

  private parseTableSummonerResult(table: { headers: string[]; rows: any[][] }, gameName: string, gameTag: string, region: string): PlayerStats | null {
    try {
      // console.log(`[MCP] parseTableSummonerResult called for ${gameName}#${gameTag}`);
      const { headers, rows } = table;
      // console.log(`[MCP] Table headers:`, headers);
      // console.log(`[MCP] Table rows count:`, rows.length);
      const idx = (k: string) => headers.indexOf(k);
      const iGameName = idx('game_name');
      const iTag = idx('tagline');
      const iLevel = idx('level');
      const iLeagueStats = idx('league_stats');
      
      // console.log(`[MCP] Column indices: game_name=${iGameName}, tagline=${iTag}, level=${iLevel}, league_stats=${iLeagueStats}`);
      
      if (iGameName === -1 || iTag === -1) {
        // console.log('[MCP] Table missing required columns:', headers);
        return null;
      }

      // console.log(`[MCP] Searching for player: ${gameName.toLowerCase()} with tag: ${gameTag.toUpperCase()}`);
      if (rows.length > 0) {
        // console.log(`[MCP] First row sample: game_name="${rows[0][iGameName]}", tagline="${rows[0][iTag]}"`);
      }
      
      const row = rows.find(r => (r[iGameName]||'').toLowerCase() === gameName.toLowerCase() && (r[iTag]||'').toUpperCase() === gameTag.toUpperCase()) || rows[0];
      if (!row) {
        // console.log('[MCP] No matching row found');
        return null;
      }
      
      // console.log(`[MCP] Using row: game_name="${row[iGameName]}", tagline="${row[iTag]}"`);
      // console.log(`[MCP] Raw level:`, row[iLevel]);
      // console.log(`[MCP] Raw league_stats:`, row[iLeagueStats]);

      const level = Number(row[iLevel] || 0) || 1;
      let tier = 'UNRANKED';
      let division = '';
      let lp = 0;
      let wins = 0;
      let losses = 0;
      
      if (iLeagueStats !== -1) {
        try {
          const leagues = JSON.parse(row[iLeagueStats]);
          const solo = Array.isArray(leagues) ? leagues.find((e: any) => (e?.game_type||'').toUpperCase().includes('SOLORANKED')) : null;
          const info = solo?.tier_info || {};
          if (info?.tier) tier = (info.tier as string).toUpperCase();
          division = this.roman(info?.division ?? null);
          lp = Number(info?.lp || 0) || 0;
          wins = Number(solo?.win || 0) || 0;
          losses = Number(solo?.lose || 0) || 0;
        } catch {}
      }

      const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
      // console.log(`[MCP] Final parsed stats: tier=${tier}, division=${division}, lp=${lp}, wins=${wins}, losses=${losses}, level=${level}, winRate=${winRate.toFixed(1)}%`);
      
      const result = this.normalizePlayerStats({
        summonerName: gameName,
        gameTag,
        region,
        tier,
        rank: division,
        lp,
        winRate,
        wins,
        losses,
        level,
        profileIconId: 0
      });
      
      // console.log(`[MCP] Normalized result:`, result);
      return result;
    } catch (error) {
      // console.error('[MCP] Failed to parse table summoner result:', error);
      return null;
    }
  }

  private parseNestedSummonerResult(nested: any, gameName: string, gameTag: string, region: string): PlayerStats | null {
    try {
      // Handle array of content
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (item && (item.tier || item.rank || item.level)) {
            return this.parseDirectSummonerResult(item, gameName, gameTag, region);
          }
        }
      }
      
      // Handle nested object
      if (nested && typeof nested === 'object') {
        return this.parseDirectSummonerResult(nested, gameName, gameTag, region);
      }
      
      return null;
    } catch (error) {
      // console.error('[MCP] Failed to parse nested summoner result:', error);
      return null;
    }
  }

  /**
   * Get recent match history for a summoner
   */
  async getMatchHistory(gameName: string, gameTag: string, region: string = 'na1', count: number = 20): Promise<MatchData[]> {
    // Force EUW for now
    region = 'euw';
    try {
      // console.log(`[MCP] Getting match history for: ${gameName}#${gameTag}`);
      
      // Try multiple parameter formats for the lol-summoner-game-history tool
      const parameterFormats = [
        // Format 1: Standard parameters
        {
          game_name: gameName,
          tag_line: gameTag,
          region: 'EUW',
          count
        },
        // Format 2: Alternative naming
        {
          gameName: gameName,
          gameTag: gameTag,
          region: 'EUW',
          limit: count
        },
        // Format 3: Riot ID format
        {
          riotId: `${gameName}#${gameTag}`,
          region: 'EUW',
          count
        },
        // Format 4: Simple format
        {
          summoner: gameName,
          tag: gameTag,
          region: 'EUW',
          games: count
        }
      ];

      let lastError = null;
      
      for (const [index, params] of parameterFormats.entries()) {
        try {
          // console.log(`[MCP] Trying match history format ${index + 1}:`, params);
          
          const result = await this.callMCPFunction('lol-summoner-game-history', params);
          // console.log(`[MCP] Match history raw result from format ${index + 1}:`, result);
          
          if (result) {
            // Try different parsing approaches
            const matches = this.parseMatchHistoryResult(result, gameName, gameTag, count);
            if (matches.length > 0) {
              // console.log(`[MCP] Successfully parsed ${matches.length} matches from format ${index + 1}`);
              return matches;
            }
          }
        } catch (error) {
          // console.warn(`[MCP] Match history format ${index + 1} failed:`, error);
          lastError = error;
          continue;
        }
      }
      
      // console.warn('[MCP] All match history formats failed, returning empty array');
      return [];
    } catch (error) {
      // console.error('[MCP] Failed to get match history:', error);
      return [];
    }
  }

  private parseMatchHistoryResult(result: any, gameName: string, gameTag: string, count: number): MatchData[] {
    try {
      // Approach 1: Direct array of matches
      if (Array.isArray(result)) {
        return this.parseMatchArray(result, gameName, gameTag, count);
      }
      
      // Approach 2: Table format
      const table = this.parseMcpTable(result);
      if (table) {
        return this.parseMatchTable(table, gameName, gameTag, count);
      }
      
      // Approach 3: Nested content
      if (result.content && Array.isArray(result.content)) {
        return this.parseMatchArray(result.content, gameName, gameTag, count);
      }
      
      // Approach 4: Data property
      if (result.data && Array.isArray(result.data)) {
        return this.parseMatchArray(result.data, gameName, gameTag, count);
      }
      
      // Approach 5: Matches property
      if (result.matches && Array.isArray(result.matches)) {
        return this.parseMatchArray(result.matches, gameName, gameTag, count);
      }
      
      // console.log('[MCP] No parseable match data found in result');
      return [];
    } catch (error) {
      // console.error('[MCP] Failed to parse match history result:', error);
      return [];
    }
  }

  private parseMatchArray(matches: any[], gameName: string, gameTag: string, count: number): MatchData[] {
    const out: MatchData[] = [];
    
    for (const match of matches.slice(0, count)) {
      try {
        // Try direct match object
        if (match.kills !== undefined && match.deaths !== undefined) {
          out.push(this.parseDirectMatch(match));
          continue;
        }
        
        // Try finding participant data
        const participants = match.participants || match.players || [];
        if (Array.isArray(participants)) {
          const me = participants.find((p: any) => 
            (p?.summoner?.game_name||'').toLowerCase() === gameName.toLowerCase() && 
            (p?.summoner?.tagline||'').toUpperCase() === gameTag.toUpperCase()
          );
          
          if (me) {
            out.push(this.parseParticipantMatch(match, me));
          }
        }
      } catch (error) {
        // console.warn('[MCP] Failed to parse individual match:', error);
      }
    }
    
    return out;
  }

  private parseMatchTable(table: { headers: string[]; rows: any[][] }, gameName: string, gameTag: string, count: number): MatchData[] {
    const { headers, rows } = table;
    const idx = (k: string) => headers.indexOf(k);
    const iParticipants = idx('participants');
    const iGameType = idx('game_type');
    const iCreatedAt = idx('created_at');
    const iGameLen = idx('game_length_second');
    const iId = idx('id');
    
    if (iParticipants === -1) return [];

    const out: MatchData[] = [];
    for (const r of rows.slice(0, count)) {
      try {
        const parts = JSON.parse(r[iParticipants]);
        const me = parts.find((p: any) => (p?.summoner?.game_name||'').toLowerCase() === gameName.toLowerCase() && (p?.summoner?.tagline||'').toUpperCase() === gameTag.toUpperCase());
        if (!me) continue;
        
        const stats = me.stats || {};
        const spells = me.spells || [];
        const win = (stats.result || '').toUpperCase() === 'WIN';
        
        out.push({
          matchId: r[iId] || '',
          championId: Number(me.champion_id || 0),
          championName: '',
          queueId: 0,
          gameMode: '',
          gameType: r[iGameType] || '',
          gameCreation: Date.parse(r[iCreatedAt]) || 0,
          gameDuration: Number(r[iGameLen] || 0),
          win,
          kills: Number(stats.kill || 0),
          deaths: Number(stats.death || 0),
          assists: Number(stats.assist || 0),
          kda: this.calculateKDA(Number(stats.kill||0), Number(stats.death||0), Number(stats.assist||0)),
          summoner1Id: Number(spells[0] || 0),
          summoner2Id: Number(spells[1] || 0),
          items: (me.items || []) as number[],
          wardsPlaced: Number(stats.ward_place || 0),
          wardsKilled: Number(stats.ward_kill || 0),
          visionScore: Number(stats.vision_score || 0),
          totalMinionsKilled: Number(stats.minion_kill || 0) + Number(stats.neutral_minion_kill || 0),
          goldEarned: Number(stats.gold_earned || 0),
          damageDealtToChampions: Number(stats.total_damage_dealt_to_champions || 0)
        });
      } catch (error) {
        // console.warn('[MCP] Failed to parse table row:', error);
      }
    }
    return out;
  }

  private parseDirectMatch(match: any): MatchData {
    return {
      matchId: match.matchId || match.id || '',
      championId: Number(match.championId || match.champion_id || 0),
      championName: match.championName || '',
      queueId: Number(match.queueId || 0),
      gameMode: match.gameMode || '',
      gameType: match.gameType || '',
      gameCreation: Number(match.gameCreation || match.created_at || 0),
      gameDuration: Number(match.gameDuration || match.duration || 0),
      win: Boolean(match.win || match.victory),
      kills: Number(match.kills || 0),
      deaths: Number(match.deaths || 0),
      assists: Number(match.assists || 0),
      kda: this.calculateKDA(Number(match.kills||0), Number(match.deaths||0), Number(match.assists||0)),
      summoner1Id: Number(match.summoner1Id || match.spell1 || 0),
      summoner2Id: Number(match.summoner2Id || match.spell2 || 0),
      items: match.items || [],
      wardsPlaced: Number(match.wardsPlaced || match.wards || 0),
      wardsKilled: Number(match.wardsKilled || 0),
      visionScore: Number(match.visionScore || 0),
      totalMinionsKilled: Number(match.totalMinionsKilled || match.cs || 0),
      goldEarned: Number(match.goldEarned || 0),
      damageDealtToChampions: Number(match.damageDealtToChampions || 0)
    };
  }

  private parseParticipantMatch(match: any, participant: any): MatchData {
    const stats = participant.stats || participant;
    const spells = participant.spells || [];
    
    return {
      matchId: match.id || match.matchId || '',
      championId: Number(participant.champion_id || participant.championId || 0),
      championName: '',
      queueId: Number(match.queueId || 0),
      gameMode: match.gameMode || '',
      gameType: match.game_type || match.gameType || '',
      gameCreation: Date.parse(match.created_at) || Number(match.gameCreation) || 0,
      gameDuration: Number(match.game_length_second || match.gameDuration || 0),
      win: (stats.result || '').toUpperCase() === 'WIN' || Boolean(stats.win),
      kills: Number(stats.kill || stats.kills || 0),
      deaths: Number(stats.death || stats.deaths || 0),
      assists: Number(stats.assist || stats.assists || 0),
      kda: this.calculateKDA(Number(stats.kill||stats.kills||0), Number(stats.death||stats.deaths||0), Number(stats.assist||stats.assists||0)),
      summoner1Id: Number(spells[0] || 0),
      summoner2Id: Number(spells[1] || 0),
      items: participant.items || [],
      wardsPlaced: Number(stats.ward_place || stats.wardsPlaced || 0),
      wardsKilled: Number(stats.ward_kill || stats.wardsKilled || 0),
      visionScore: Number(stats.vision_score || stats.visionScore || 0),
      totalMinionsKilled: Number(stats.minion_kill || 0) + Number(stats.neutral_minion_kill || 0) || Number(stats.totalMinionsKilled || 0),
      goldEarned: Number(stats.gold_earned || stats.goldEarned || 0),
      damageDealtToChampions: Number(stats.total_damage_dealt_to_champions || stats.damageDealtToChampions || 0)
    };
  }

  /**
   * Analyze player using only the reliable MCP API.
   * Accepts optional onProgress callback for UI logging.
   */
  async analyzePlayer(
    gameName: string,
    gameTag: string,
    region: string = 'na1',
    puuid?: string,
    onProgress?: (msg: string) => void
  ): Promise<PlayerAnalysis | null> {
    // Force EUW for now
    region = 'euw';
    const log = (m: string) => { 
      try { 
        onProgress?.(m); 
      } catch {} 
    };

    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => {
          reject(new Error(`${label} timeout after ${ms}ms`));
        }, ms);
        
        p.then(v => { 
          clearTimeout(t); 
          resolve(v); 
        }).catch(e => { 
          clearTimeout(t); 
          reject(e); 
        });
      });
    };

    try {
      log('MCP API: searching OP.GG...');
      const stats = await withTimeout(
        this.searchSummoner(gameName, gameTag, region) as Promise<PlayerStats|null>, 
        15000, 
        'OPGG MCP search'
      );
      
      if (!stats) {
        throw new Error('MCP API search returned null - player not found');
      }
      
      log('MCP API: fetching match history...');
      const recentMatches = await withTimeout(
        this.getMatchHistory(gameName, gameTag, region, 50), 
        15000, 
        'OPGG MCP history'
      );
      
      log('MCP API: analyzing player data...');
      const boostedFlags = this.detectBoostingIndicators(recentMatches);
      const performanceFlags = this.analyzePerformance(recentMatches.slice(0, 5));
      const riskScore = this.calculateRiskScore(boostedFlags, performanceFlags, stats);
      
      log(`MCP API: success (${recentMatches.length} matches, risk: ${riskScore})`);
      return { 
        playerStats: stats, 
        recentMatches: recentMatches.slice(0, 10), 
        boostedFlags, 
        performanceFlags, 
        riskScore 
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`MCP API: failed - ${msg}`);
      throw new Error(`MCP API failed: ${msg}`);
    }
  }

  /**
   * Detect potential boosting indicators
   */
  private detectBoostingIndicators(matches: MatchData[]): PlayerAnalysis['boostedFlags'] {
    const flashId = 4; // Flash summoner spell ID
    let flashPositionChanges = 0;
    let lastFlashPosition: 'D' | 'F' | null = null;

    // Analyze flash position changes over 70 games
    for (const match of matches) {
      let currentFlashPosition: 'D' | 'F' | null = null;
      
      if (match.summoner1Id === flashId) {
        currentFlashPosition = 'D';
      } else if (match.summoner2Id === flashId) {
        currentFlashPosition = 'F';
      }

      if (currentFlashPosition && lastFlashPosition && currentFlashPosition !== lastFlashPosition) {
        flashPositionChanges++;
      }

      if (currentFlashPosition) {
        lastFlashPosition = currentFlashPosition;
      }
    }

    // Check for suspicious performance patterns
    const recentWinRate = this.calculateWinRate(matches.slice(0, 20));
    const olderWinRate = this.calculateWinRate(matches.slice(20, 50));
    const winRateSpike = recentWinRate - olderWinRate > 30; // 30% winrate improvement

    // Check for inconsistent playstyle (big variations in performance)
    const kdaVariance = this.calculateKDAVariance(matches.slice(0, 20));
    const inconsistentPlaystyle = kdaVariance > 2.0; // High KDA variance indicates inconsistency

    return {
      flashPositionChanged: flashPositionChanges > 0,
      flashChangeCount: flashPositionChanges,
      recentPerformanceDrop: false, // Will implement based on KDA trends
      suspiciousWinrateSpike: winRateSpike,
      inconsistentPlaystyle
    };
  }

  /**
   * Analyze recent performance for feeding/poor play indicators
   */
  private analyzePerformance(recentMatches: MatchData[]): PlayerAnalysis['performanceFlags'] {
    if (recentMatches.length === 0) {
      return {
        isFeeding: false,
        poorKDA: false,
        lowVisionScore: false,
        inconsistentCS: false
      };
    }

    const avgDeaths = recentMatches.reduce((sum, match) => sum + match.deaths, 0) / recentMatches.length;
    const avgKDA = recentMatches.reduce((sum, match) => sum + match.kda, 0) / recentMatches.length;
    const avgVisionScore = recentMatches.reduce((sum, match) => sum + match.visionScore, 0) / recentMatches.length;
    const avgCS = recentMatches.reduce((sum, match) => sum + match.totalMinionsKilled, 0) / recentMatches.length;

    // Calculate CS variance to detect inconsistency
    const csVariance = this.calculateVariance(recentMatches.map(m => m.totalMinionsKilled));

    return {
      isFeeding: avgDeaths > 10,
      poorKDA: avgKDA < 1.0,
      lowVisionScore: avgVisionScore < 15, // Low vision control
      inconsistentCS: csVariance > 2500 // High CS variance
    };
  }

  /**
   * Calculate overall risk score (0-100)
   */
  private calculateRiskScore(
    boostedFlags: PlayerAnalysis['boostedFlags'],
    performanceFlags: PlayerAnalysis['performanceFlags'],
    playerStats: PlayerStats
  ): number {
    let score = 0;

    // Boosting indicators
    if (boostedFlags.flashPositionChanged) score += boostedFlags.flashChangeCount * 10;
    if (boostedFlags.suspiciousWinrateSpike) score += 25;
    if (boostedFlags.inconsistentPlaystyle) score += 15;

    // Performance issues
    if (performanceFlags.isFeeding) score += 20;
    if (performanceFlags.poorKDA) score += 15;
    if (performanceFlags.lowVisionScore) score += 10;
    if (performanceFlags.inconsistentCS) score += 10;

    // High rank with suspicious indicators is more concerning
    const isHighRank = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(playerStats.tier);
    if (isHighRank && score > 30) score += 20;

    return Math.min(100, score);
  }

  /**
   * Utility functions
   */
  private calculateKDA(kills: number, deaths: number, assists: number): number {
    return deaths === 0 ? kills + assists : (kills + assists) / deaths;
  }

  private calculateWinRate(matches: MatchData[]): number {
    if (matches.length === 0) return 0;
    const wins = matches.filter(m => m.win).length;
    return (wins / matches.length) * 100;
  }

  private calculateKDAVariance(matches: MatchData[]): number {
    const kdas = matches.map(m => m.kda);
    return this.calculateVariance(kdas);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Bulk analyze multiple players (for champion select lobby)
   */
  async analyzeLobbyPlayers(players: { gameName: string; gameTag: string; puuid?: string }[], region: string = 'na1'): Promise<PlayerAnalysis[]> {
    const results: PlayerAnalysis[] = [];
    
    // Process players sequentially to respect rate limits
    for (const player of players) {
      try {
        const analysis = await this.analyzePlayer(player.gameName, player.gameTag, region, player.puuid);
        if (analysis) {
          results.push(analysis);
        }
        
        // Add delay between players to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      } catch (error) {
        // console.error(`Failed to analyze player ${player.gameName}#${player.gameTag}:`, error);
      }
    }
    
    return results;
  }
}

// Singleton instance
export const opggApi = new OpggApiClient();
