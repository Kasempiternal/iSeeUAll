<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Loader2, RefreshCw, Users, AlertTriangle, Eye } from "lucide-svelte";
  import PlayerCard from "./PlayerCard.svelte";
  import type { PlayerAnalysis, PlayerStats } from "$lib/opgg-api";
  import { opggApi } from "$lib/opgg-api";

  export let players: { gameName: string; gameTag: string }[] = [];
  export let region: string = 'na1';
  export let autoAnalyze: boolean = true;

  let analyses: PlayerAnalysis[] = [];
  let isLoading = false;
  let error: string | null = null;
  let analysisStartTime: number = 0;
  let analysisEndTime: number = 0;

  $: highRiskPlayers = analyses.filter(a => a.riskScore >= 70);
  $: mediumRiskPlayers = analyses.filter(a => a.riskScore >= 40 && a.riskScore < 70);
  $: totalBoostedFlags = analyses.reduce((sum, a) => 
    sum + (a.boostedFlags.flashPositionChanged ? 1 : 0) + 
    (a.boostedFlags.suspiciousWinrateSpike ? 1 : 0) + 
    (a.boostedFlags.inconsistentPlaystyle ? 1 : 0), 0);
  $: totalPerformanceIssues = analyses.reduce((sum, a) => 
    sum + (a.performanceFlags.isFeeding ? 1 : 0) + 
    (a.performanceFlags.poorKDA ? 1 : 0), 0);

  onMount(async () => {
    if (autoAnalyze && players.length > 0) {
      await analyzePlayers();
    }
  });

  // Watch for changes in players array
  $: if (players.length > 0 && autoAnalyze) {
    analyzePlayers();
  }

  async function analyzePlayers() {
    if (players.length === 0) return;
    
    isLoading = true;
    error = null;
    analysisStartTime = Date.now();
    analyses = [];
    
    try {
      console.log(`Starting analysis of ${players.length} players...`);
      const results = await opggApi.analyzeLobbyPlayers(players, region);
      analyses = results;
      analysisEndTime = Date.now();
      
      console.log(`Analysis completed in ${((analysisEndTime - analysisStartTime) / 1000).toFixed(1)}s`);
      console.log(`Found ${highRiskPlayers.length} high-risk and ${mediumRiskPlayers.length} medium-risk players`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to analyze players';
      console.error('Player analysis failed:', err);
    } finally {
      isLoading = false;
    }
  }

  async function refreshAnalysis() {
    await analyzePlayers();
  }

  function getRiskSummary(): string {
    const totalRisk = highRiskPlayers.length + mediumRiskPlayers.length;
    if (totalRisk === 0) return "All players look good!";
    if (highRiskPlayers.length > 0) return `⚠️ ${highRiskPlayers.length} high-risk player(s) detected`;
    return `⚡ ${mediumRiskPlayers.length} player(s) need attention`;
  }

  function getAnalysisTime(): string {
    if (analysisStartTime === 0) return '';
    const duration = (analysisEndTime - analysisStartTime) / 1000;
    return `Analysis completed in ${duration.toFixed(1)}s`;
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <Card class="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
    <CardHeader class="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-t-lg">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <Users class="h-4 w-4" />
          </div>
          <div>
            <CardTitle class="text-xl">Lobby Analysis</CardTitle>
            {#if players.length > 0}
              <Badge variant="secondary" class="mt-1 bg-white/20 text-white border-white/30">{players.length} players</Badge>
            {/if}
          </div>
        </div>
        
        <div class="flex items-center space-x-2">
          {#if !isLoading && analyses.length > 0}
            <Button variant="outline" size="sm" on:click={refreshAnalysis} class="bg-white/20 text-white border-white/30 hover:bg-white/30">
              <RefreshCw class="h-4 w-4 mr-1" />
              Refresh
            </Button>
          {/if}
          
          {#if !autoAnalyze && players.length > 0 && analyses.length === 0}
            <Button size="sm" on:click={analyzePlayers} class="bg-white/20 text-white border-white/30 hover:bg-white/30">
              <Eye class="h-4 w-4 mr-1" />
              Analyze Lobby
            </Button>
          {/if}
        </div>
      </div>
    </CardHeader>
    
    {#if players.length > 0}
      <CardContent>
        <!-- Analysis Status -->
        {#if isLoading}
          <div class="flex items-center justify-center space-x-2 py-6">
            <Loader2 class="h-5 w-5 animate-spin" />
            <span class="text-sm text-gray-600">Analyzing players...</span>
          </div>
        {:else if error}
          <div class="flex items-center justify-center space-x-2 py-6 text-red-600">
            <AlertTriangle class="h-5 w-5" />
            <span class="text-sm">{error}</span>
          </div>
        {:else if analyses.length > 0}
          <!-- Summary Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">{analyses.length - highRiskPlayers.length - mediumRiskPlayers.length}</div>
              <div class="text-xs text-gray-500">Safe Players</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-yellow-600">{mediumRiskPlayers.length}</div>
              <div class="text-xs text-gray-500">Medium Risk</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">{highRiskPlayers.length}</div>
              <div class="text-xs text-gray-500">High Risk</div>
            </div>
          </div>
          
          <!-- Risk Summary -->
          <div class="text-center mb-4">
            <Badge 
              variant={highRiskPlayers.length > 0 ? "destructive" : mediumRiskPlayers.length > 0 ? "secondary" : "default"}
              class="text-sm"
            >
              {getRiskSummary()}
            </Badge>
          </div>
          
          <!-- Analysis Time -->
          {#if getAnalysisTime()}
            <div class="text-center text-xs text-gray-500 mb-4">
              {getAnalysisTime()}
            </div>
          {/if}
          
          <!-- Detailed Flags -->
          {#if totalBoostedFlags > 0 || totalPerformanceIssues > 0}
            <div class="grid grid-cols-2 gap-4 text-center text-xs">
              <div>
                <span class="font-medium text-orange-600">{totalBoostedFlags}</span>
                <div class="text-gray-500">Boosting Indicators</div>
              </div>
              <div>
                <span class="font-medium text-red-600">{totalPerformanceIssues}</span>
                <div class="text-gray-500">Performance Issues</div>
              </div>
            </div>
          {/if}
        {/if}
      </CardContent>
    {:else}
      <CardContent>
        <div class="text-center text-gray-500 py-6">
          <Users class="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No players to analyze</p>
          <p class="text-xs">Join a champion select lobby to see player analysis</p>
        </div>
      </CardContent>
    {/if}
  </Card>

  <!-- Player Cards Grid -->
  {#if analyses.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Sort by risk score (highest first) -->
      {#each analyses.sort((a, b) => b.riskScore - a.riskScore) as analysis (analysis.playerStats.summonerName + analysis.playerStats.gameTag)}
        <PlayerCard {analysis} />
      {/each}
    </div>
  {/if}
</div>