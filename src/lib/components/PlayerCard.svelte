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
  $: riskColor = riskScore >= 70 ? 'text-red-500' : riskScore >= 40 ? 'text-yellow-500' : 'text-green-500';
  $: riskBg = riskScore >= 70 ? 'bg-red-100' : riskScore >= 40 ? 'bg-yellow-100' : 'bg-green-100';
  
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
</script>

<Card class="w-full max-w-md {riskBg} border-l-4 {riskScore >= 70 ? 'border-l-red-500' : riskScore >= 40 ? 'border-l-yellow-500' : 'border-l-green-500'}">
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
    <div class="text-sm text-gray-600">
      Level {playerStats.level} • {playerStats.region.toUpperCase()}
    </div>
  </CardHeader>
  
  <CardContent class="space-y-4">
    <!-- Rank Information -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <span class="text-sm font-medium">Rank:</span>
        <Badge variant="outline" class="{rankColors[playerStats.tier] || 'text-gray-500'}">
          {playerStats.tier === 'UNRANKED' ? 'Unranked' : `${playerStats.tier} ${playerStats.rank}`}
        </Badge>
      </div>
      {#if playerStats.tier !== 'UNRANKED'}
        <span class="text-sm text-gray-600">{playerStats.lp} LP</span>
      {/if}
    </div>
    
    <!-- Win Rate -->
    <div class="space-y-1">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium">Win Rate</span>
        <span class="font-bold {playerStats.winRate >= 60 ? 'text-green-600' : playerStats.winRate <= 40 ? 'text-red-600' : 'text-gray-700'}">
          {playerStats.winRate.toFixed(1)}%
        </span>
      </div>
      <Progress value={playerStats.winRate} class="h-2" />
      <div class="flex justify-between text-xs text-gray-500">
        <span>{playerStats.wins}W</span>
        <span>{playerStats.losses}L</span>
      </div>
    </div>
    
    <!-- Risk Assessment -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Risk Score</span>
        <Badge variant="destructive" class="{riskBg} {riskColor}">
          {getRiskLabel(riskScore)}
        </Badge>
      </div>
      <Progress value={riskScore} class="h-2" />
      <span class="text-xs text-gray-600">{riskScore}/100</span>
    </div>
    
    <!-- Warning Flags -->
    {#if boostedFlags.flashPositionChanged || boostedFlags.suspiciousWinrateSpike || performanceFlags.isFeeding || performanceFlags.poorKDA}
      <div class="space-y-2">
        <span class="text-sm font-medium text-amber-700">⚠️ Warning Signs</span>
        <div class="space-y-1">
          {#if boostedFlags.flashPositionChanged}
            <div class="flex items-center text-xs text-red-600">
              <TrendingDown class="h-3 w-3 mr-1" />
              Flash position changed {boostedFlags.flashChangeCount} time(s) recently
            </div>
          {/if}
          
          {#if boostedFlags.suspiciousWinrateSpike}
            <div class="flex items-center text-xs text-orange-600">
              <TrendingUp class="h-3 w-3 mr-1" />
              Suspicious winrate improvement detected
            </div>
          {/if}
          
          {#if boostedFlags.inconsistentPlaystyle}
            <div class="flex items-center text-xs text-yellow-600">
              <AlertTriangle class="h-3 w-3 mr-1" />
              Inconsistent performance patterns
            </div>
          {/if}
          
          {#if performanceFlags.isFeeding}
            <div class="flex items-center text-xs text-red-600">
              <TrendingDown class="h-3 w-3 mr-1" />
              High death count (feeding pattern)
            </div>
          {/if}
          
          {#if performanceFlags.poorKDA}
            <div class="flex items-center text-xs text-red-600">
              <TrendingDown class="h-3 w-3 mr-1" />
              Poor KDA performance
            </div>
          {/if}
          
          {#if performanceFlags.lowVisionScore}
            <div class="flex items-center text-xs text-yellow-600">
              <AlertTriangle class="h-3 w-3 mr-1" />
              Low vision control
            </div>
          {/if}
        </div>
      </div>
    {/if}
    
    <!-- Recent Matches Preview -->
    {#if analysis.recentMatches.length > 0}
      <div class="space-y-2">
        <span class="text-sm font-medium">Recent Matches</span>
        <div class="flex space-x-1">
          {#each analysis.recentMatches.slice(0, 8) as match}
            <div 
              class="w-4 h-4 rounded-sm flex items-center justify-center text-[10px] font-bold text-white
                     {match.win ? 'bg-green-500' : 'bg-red-500'}"
              title="{match.championName}: {match.kills}/{match.deaths}/{match.assists} - {match.win ? 'Win' : 'Loss'}"
            >
              {match.win ? 'W' : 'L'}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </CardContent>
</Card>