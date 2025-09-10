<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Progress } from "$lib/components/ui/progress";
  import type { PlayerAnalysis } from "$lib/opgg-api";
  import { AlertTriangle, Shield, TrendingDown, TrendingUp } from "lucide-svelte";

  export let analysis: PlayerAnalysis;
  
  $: playerStats = analysis.playerStats;
  $: boostedFlags = analysis.boostedFlags;
  $: performanceFlags = analysis.performanceFlags;
  $: riskScore = analysis.riskScore;
  
  // Color coding based on risk score
  $: riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-yellow-400' : 'text-green-400';
  // Use dark card background; avoid light backgrounds in black theme
  $: riskBg = '';
  
  // Rank color mapping
  const rankColors: Record<string, string> = {
    'IRON': 'text-gray-600',
    'BRONZE': 'text-amber-700',
    'SILVER': 'text-gray-400',
    'GOLD': 'text-yellow-500',
    'PLATINUM': 'text-cyan-400',
    'EMERALD': 'text-green-400',
    'DIAMOND': 'text-blue-400',
    'MASTER': 'text-purple-500',
    'GRANDMASTER': 'text-red-400',
    'CHALLENGER': 'text-yellow-300',
    'UNRANKED': 'text-gray-500'
  };

  function getRiskLabel(score: number): string {
    if (score >= 70) return 'HIGH RISK';
    if (score >= 40) return 'MEDIUM RISK';
    return 'LOW RISK';
  }

  $: isUnranked = !playerStats?.tier || playerStats.tier === 'UNRANKED' || playerStats.tier === 'NA';
  $: hasRankedWL = (playerStats?.wins ?? 0) + (playerStats?.losses ?? 0) > 0;
  $: hasMatches = (analysis?.recentMatches?.length ?? 0) > 0;

  // Primary role detection from recent matches
  const SMITE_ID = 11;
  const HEAL_ID = 7;
  const TELEPORT_ID = 12;
  function detectPrimaryRole() {
    if (!hasMatches) return 'Unknown';
    const games = analysis.recentMatches.slice(0, 10);
    const smiteCount = games.filter(m => m.summoner1Id === SMITE_ID || m.summoner2Id === SMITE_ID).length;
    if (smiteCount >= Math.max(1, Math.ceil(games.length * 0.4))) return 'Jungle';
    // compute CS/min over recent
    const csmins = games.map(m => {
      const mins = Math.max(1, Math.round((m.gameDuration || 0) / 60));
      return (m.totalMinionsKilled || 0) / mins;
    });
    const avgCsMin = csmins.reduce((a,b)=>a+b,0) / csmins.length;
    const healCount = games.filter(m => m.summoner1Id === HEAL_ID || m.summoner2Id === HEAL_ID).length;
    const tpCount = games.filter(m => m.summoner1Id === TELEPORT_ID || m.summoner2Id === TELEPORT_ID).length;
    if (avgCsMin < 3.0) return 'Support';
    if (avgCsMin >= 5.5 && healCount >= Math.ceil(games.length * 0.3)) return 'ADC';
    if (tpCount >= Math.ceil(games.length * 0.4)) return 'Top';
    return 'Mid';
  }
  $: primaryRole = detectPrimaryRole();
</script>

<Card class="w-full max-w-md bg-gray-900/80 border border-gray-800 shadow-md border-l-4 {riskScore >= 70 ? 'border-l-red-500' : riskScore >= 40 ? 'border-l-yellow-500' : 'border-l-green-600'}">
  <CardHeader class="pb-3">
    <div class="flex items-center justify-between">
      <CardTitle class="text-lg font-bold">
        {playerStats.summonerName}#{playerStats.gameTag}
      </CardTitle>
      {#if riskScore >= 40}
        <AlertTriangle class="h-5 w-5 {riskColor}" />
      {:else}
        <Shield class="h-5 w-5 {riskColor}" />
      {/if}
    </div>
    <div class="text-sm text-gray-300">
      Level {playerStats.level} • {playerStats.region.toUpperCase()} • {primaryRole}
    </div>
  </CardHeader>
  
  <CardContent class="space-y-4">
    <!-- Rank Information -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <span class="text-sm font-medium">Rank:</span>
        <Badge variant="outline" class="{rankColors[playerStats.tier] || 'text-gray-500'}">
          {isUnranked ? 'Unranked' : `${playerStats.tier} ${playerStats.rank}`}
        </Badge>
      </div>
      {#if !isUnranked}
        <span class="text-sm text-gray-300">{playerStats.lp} LP</span>
      {/if}
    </div>
    
    <!-- Win Rate -->
    {#if hasRankedWL}
      <div class="space-y-1">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Win Rate</span>
          <span class="font-bold {playerStats.winRate >= 60 ? 'text-green-400' : playerStats.winRate <= 40 ? 'text-red-400' : 'text-gray-200'}">
            {playerStats.winRate.toFixed(1)}%
          </span>
        </div>
        <Progress value={playerStats.winRate} class="h-2" />
        <div class="flex justify-between text-xs text-gray-400">
          <span>{playerStats.wins}W</span>
          <span>{playerStats.losses}L</span>
        </div>
      </div>
    {:else}
      <div class="space-y-1">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Win Rate</span>
          <span class="text-gray-400">N/A</span>
        </div>
        <div class="text-xs text-gray-400">No ranked data</div>
      </div>
    {/if}
    
    <!-- Risk Assessment -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Risk Score</span>
        <Badge variant="destructive" class="{riskColor} bg-transparent border border-current">
          {getRiskLabel(riskScore)}
        </Badge>
      </div>
      <Progress value={riskScore} class="h-2" />
      <span class="text-xs text-gray-300">{riskScore}/100</span>
    </div>
    
    <!-- Warning Flags -->
    {#if hasMatches && (boostedFlags.flashPositionChanged || boostedFlags.suspiciousWinrateSpike || performanceFlags.isFeeding || performanceFlags.poorKDA)}
      <div class="space-y-2">
        <span class="text-sm font-medium text-amber-400">⚠️ Warning Signs</span>
        <div class="space-y-1">
          {#if boostedFlags.flashPositionChanged}
            <div class="flex items-center text-xs text-red-400">
              <TrendingDown class="h-3 w-3 mr-1" />
              Flash position changed {boostedFlags.flashChangeCount} time(s) recently
            </div>
          {/if}
          
          {#if boostedFlags.suspiciousWinrateSpike}
            <div class="flex items-center text-xs text-orange-400">
              <TrendingUp class="h-3 w-3 mr-1" />
              Suspicious winrate improvement detected
            </div>
          {/if}
          
          {#if boostedFlags.inconsistentPlaystyle}
            <div class="flex items-center text-xs text-yellow-400">
              <AlertTriangle class="h-3 w-3 mr-1" />
              Inconsistent performance patterns
            </div>
          {/if}
          
          {#if performanceFlags.isFeeding}
            <div class="flex items-center text-xs text-red-400">
              <TrendingDown class="h-3 w-3 mr-1" />
              High death count (feeding pattern)
            </div>
          {/if}
          
          {#if performanceFlags.poorKDA}
            <div class="flex items-center text-xs text-red-400">
              <TrendingDown class="h-3 w-3 mr-1" />
              Poor KDA performance
            </div>
          {/if}
          
          {#if performanceFlags.lowVisionScore}
            <div class="flex items-center text-xs text-yellow-400">
              <AlertTriangle class="h-3 w-3 mr-1" />
              Low vision control
            </div>
          {/if}
        </div>
      </div>
    {/if}
    
    <!-- Recent Matches List -->
    {#if hasMatches}
      <div class="space-y-2">
        <span class="text-sm font-medium">Recent Matches</span>
        <div class="space-y-1">
          {#each analysis.recentMatches.slice(0, 10) as match}
            <div class="flex items-center justify-between text-xs px-2 py-1 rounded border border-gray-800 bg-gray-950/60">
              <div class="flex items-center gap-2">
                <span class="font-semibold {match.win ? 'text-green-400' : 'text-red-400'}">{match.win ? 'W' : 'L'}</span>
                <span class="text-gray-200">{match.championName || ('#' + match.championId)}</span>
              </div>
              <div class="text-gray-300">
                {match.kills}/{match.deaths}/{match.assists}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </CardContent>
</Card>
