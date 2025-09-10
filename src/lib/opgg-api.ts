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
      console.error(`OP.GG API request failed for ${endpoint}:`, error);
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
      console.error(`MCP API call failed for ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Search for summoner by game name and tag
   */
  async searchSummoner(gameName: string, gameTag: string, region: string = 'na1'): Promise<PlayerStats | null> {
    try {
      const response = await this.makeRequest('lol-summoner-search', {
        gameName,
        gameTag,
        region
      });

      if (!response) return null;

      return {
        summonerName: gameName,
        gameTag,
        region,
        tier: response.tier || 'UNRANKED',
        rank: response.rank || '',
        lp: response.leaguePoints || 0,
        winRate: response.winRate || 0,
        wins: response.wins || 0,
        losses: response.losses || 0,
        level: response.summonerLevel || 1,
        profileIconId: response.profileIconId || 0
      };
    } catch (error) {
      console.error('Failed to search summoner:', error);
      return null;
    }
  }

  /**
   * Get recent match history for a summoner
   */
  async getMatchHistory(gameName: string, gameTag: string, region: string = 'na1', count: number = 20): Promise<MatchData[]> {
    try {
      const response = await this.makeRequest('lol-summoner-game-history', {
        gameName,
        gameTag,
        region,
        count
      });

      if (!response || !response.matches) return [];

      return response.matches.map((match: any): MatchData => ({
        matchId: match.gameId || '',
        championId: match.championId || 0,
        championName: match.championName || '',
        queueId: match.queueId || 0,
        gameMode: match.gameMode || '',
        gameType: match.gameType || '',
        gameCreation: match.gameCreationDate || 0,
        gameDuration: match.gameDurationInSeconds || 0,
        win: match.isWin || false,
        kills: match.stats?.kills || 0,
        deaths: match.stats?.deaths || 0,
        assists: match.stats?.assists || 0,
        kda: this.calculateKDA(match.stats?.kills || 0, match.stats?.deaths || 0, match.stats?.assists || 0),
        summoner1Id: match.spells?.[0] || 0,
        summoner2Id: match.spells?.[1] || 0,
        items: match.stats?.items || [],
        wardsPlaced: match.stats?.wardsPlaced || 0,
        wardsKilled: match.stats?.wardsKilled || 0,
        visionScore: match.stats?.visionScore || 0,
        totalMinionsKilled: match.stats?.totalMinionsKilled || 0,
        goldEarned: match.stats?.goldEarned || 0,
        damageDealtToChampions: match.stats?.totalDamageDealtToChampions || 0
      }));
    } catch (error) {
      console.error('Failed to get match history:', error);
      return [];
    }
  }

  /**
   * Analyze player for boosting indicators and performance issues
   */
  async analyzePlayer(gameName: string, gameTag: string, region: string = 'na1'): Promise<PlayerAnalysis | null> {
    try {
      const playerStats = await this.searchSummoner(gameName, gameTag, region);
      if (!playerStats) return null;

      const recentMatches = await this.getMatchHistory(gameName, gameTag, region, 70); // Get 70 games for flash analysis
      
      const boostedFlags = this.detectBoostingIndicators(recentMatches);
      const performanceFlags = this.analyzePerformance(recentMatches.slice(0, 5)); // Last 5 games for performance
      const riskScore = this.calculateRiskScore(boostedFlags, performanceFlags, playerStats);

      return {
        playerStats,
        recentMatches: recentMatches.slice(0, 10), // Return last 10 for UI display
        boostedFlags,
        performanceFlags,
        riskScore
      };
    } catch (error) {
      console.error('Failed to analyze player:', error);
      return null;
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
  async analyzeLobbyPlayers(players: { gameName: string; gameTag: string }[], region: string = 'na1'): Promise<PlayerAnalysis[]> {
    const results: PlayerAnalysis[] = [];
    
    // Process players sequentially to respect rate limits
    for (const player of players) {
      try {
        const analysis = await this.analyzePlayer(player.gameName, player.gameTag, region);
        if (analysis) {
          results.push(analysis);
        }
        
        // Add delay between players to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      } catch (error) {
        console.error(`Failed to analyze player ${player.gameName}#${player.gameTag}:`, error);
      }
    }
    
    return results;
  }
}

// Singleton instance
export const opggApi = new OpggApiClient();