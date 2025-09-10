<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Loader2, RefreshCw, Users, AlertTriangle, Eye, CheckCircle, XCircle } from "lucide-svelte";
  import PlayerCard from "./PlayerCard.svelte";
  import type { PlayerAnalysis, PlayerStats } from "$lib/opgg-api";
  import { opggApi } from "$lib/opgg-api";

  export let players: { gameName: string; gameTag: string; puuid?: string }[] = [];
  export let region: string = 'na1';
  export let autoAnalyze: boolean = true;

  let analyses: PlayerAnalysis[] = [];
  let isLoading = false;
  let error: string | null = null;
  let analysisStartTime: number = 0;
  let analysisEndTime: number = 0;
  let isRunning = false; // prevent overlapping analyses
  let logs: string[] = [];
  let playerStatuses: Record<string, { stage: string; startedAt: number; endedAt?: number; error?: string; success?: boolean }>= {};
  let lastAttemptedKey: string | null = null;

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

  // Watch for changes in players array (guarded, avoid re-running on same lobby)
  $: {
    const key = players
      .map(p => `${p.gameName}#${p.gameTag}`.toLowerCase())
      .sort()
      .join('|');
    if (players.length > 0 && autoAnalyze && !isRunning && !isLoading && key && key !== lastAttemptedKey) {
      lastAttemptedKey = key;
      analyzePlayers();
    }
  }

  async function analyzePlayers() {
    if (players.length === 0 || isRunning) return;
    isRunning = true;

    isLoading = true;
    error = null;
    logs = [];
    analysisStartTime = Date.now();
    analyses = [];
    playerStatuses = {};

    const total = players.length;
    logs.push(`Starting analysis for ${total} player(s) in region ${region}`);

    try {
      for (const p of players) {
        const key = `${p.gameName}#${p.gameTag}`;
        playerStatuses[key] = { stage: 'starting', startedAt: Date.now() };
        logs.push(`[${key}] starting`);

        try {
          playerStatuses[key].stage = 'searching';
          logs.push(`[${key}] Starting analysis (MCP API only - reliable data source)`);

          const result = await opggApi.analyzePlayer(
            p.gameName,
            p.gameTag,
            region,
            p.puuid,
            (m: string) => { 
              logs.push(`[${key}] ${m}`);
              // Update the logs in real-time
              logs = [...logs];
            }
          );

          if (result) {
            analyses = [...analyses, result];
            playerStatuses[key].stage = 'done';
            playerStatuses[key].success = true;
            playerStatuses[key].endedAt = Date.now();
            const duration = ((playerStatuses[key].endedAt! - playerStatuses[key].startedAt)/1000).toFixed(1);
            logs.push(`[${key}] ✅ Complete in ${duration}s | ${result.playerStats.tier} ${result.playerStats.rank} | Risk: ${result.riskScore} | WR: ${result.playerStats.winRate.toFixed(1)}%`);
          } else {
            playerStatuses[key].stage = 'failed';
            playerStatuses[key].success = false;
            playerStatuses[key].endedAt = Date.now();
            playerStatuses[key].error = 'All analysis strategies returned no data';
            logs.push(`[${key}] ❌ Failed: No data from any source`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          playerStatuses[key].stage = 'error';
          playerStatuses[key].success = false;
          playerStatuses[key].endedAt = Date.now();
          playerStatuses[key].error = msg;
          
          // Provide more helpful error messages
          let userFriendlyError = msg;
          if (msg.includes('timeout')) {
            userFriendlyError = 'Request timed out - OP.GG may be slow';
          } else if (msg.includes('Network error') || msg.includes('Failed to fetch')) {
            userFriendlyError = 'Network connection issue';
          } else if (msg.includes('404') || msg.includes('not found')) {
            userFriendlyError = 'Player profile not found';
          } else if (msg.includes('All OP.GG API endpoints failed')) {
            userFriendlyError = 'OP.GG MCP API unavailable';
          }
          
          logs.push(`[${key}] ❌ Error: ${userFriendlyError}`);
        }

        // Respect rate limit between players
        await new Promise(r => setTimeout(r, 800));
      }

      analysisEndTime = Date.now();
      logs.push(`All players processed in ${((analysisEndTime - analysisStartTime)/1000).toFixed(1)}s`);
    } finally {
      isLoading = false;
      isRunning = false;
    }
  }

  async function openMultiSearch() {
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke("open_opgg_link");
      logs.push('Opened OP.GG Multi-Search in browser');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logs.push('Failed to open Multi-Search: ' + msg);
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
  <Card class="bg-gray-900/80 backdrop-blur-sm border border-gray-800 shadow-lg">
    <CardHeader class="bg-gradient-to-r from-purple-700 to-pink-700 text-white rounded-t-lg">
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

          <Button variant="outline" size="sm" on:click={openMultiSearch} class="bg-white/20 text-white border-white/30 hover:bg-white/30">
            <Eye class="h-4 w-4 mr-1" />
            Open Multi-Search
          </Button>
        
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
        <!-- Analysis Status / Progress -->
        {#if isLoading}
          <div class="space-y-3 py-4">
            <div class="flex items-center justify-center space-x-2">
              <Loader2 class="h-5 w-5 animate-spin" />
              <span class="text-sm text-gray-300">Analyzing players...</span>
            </div>
            <div class="text-center text-xs text-gray-500">
              {Object.values(playerStatuses).filter(s=>s.success===true||s.stage==='done').length}/{players.length} completed, {Object.values(playerStatuses).filter(s=>s.success===false||s.stage==='error'||s.stage==='failed').length} failed
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              {#each players as p (p.gameName + '#' + p.gameTag)}
                {#key p.gameName + '#' + p.gameTag}
                  <div class="flex items-center justify-between rounded-md border p-2 bg-black/50 border-gray-800">
                    <div class="text-xs">
                      <div class="font-medium text-gray-200">{p.gameName}#{p.gameTag}</div>
                      <div class="text-gray-400">{playerStatuses[p.gameName + '#' + p.gameTag]?.stage || 'pending'}</div>
                    </div>
                    <div>
                      {#if playerStatuses[p.gameName + '#' + p.gameTag]?.success}
                        <CheckCircle class="h-4 w-4 text-green-400" />
                      {:else if playerStatuses[p.gameName + '#' + p.gameTag]?.stage === 'error' || playerStatuses[p.gameName + '#' + p.gameTag]?.stage === 'failed'}
                        <XCircle class="h-4 w-4 text-red-400" />
                      {:else}
                        <Loader2 class="h-4 w-4 animate-spin text-gray-400" />
                      {/if}
                    </div>
                  </div>
                {/key}
              {/each}
            </div>
            <!-- Verbose logs -->
            {#if logs.length > 0}
              <div class="max-h-40 overflow-auto text-[11px] font-mono bg-black/80 text-green-200 rounded-md p-2">
                {#each logs as line}
                  <div>{line}</div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if error}
          <div class="flex items-center justify-center space-x-2 py-6 text-red-600">
            <AlertTriangle class="h-5 w-5" />
            <span class="text-sm">{error}</span>
          </div>
        {:else if analyses.length > 0}
          <!-- Summary Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-gray-200">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-400">{analyses.length - highRiskPlayers.length - mediumRiskPlayers.length}</div>
              <div class="text-xs text-gray-400">Safe Players</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-yellow-400">{mediumRiskPlayers.length}</div>
              <div class="text-xs text-gray-400">Medium Risk</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-400">{highRiskPlayers.length}</div>
              <div class="text-xs text-gray-400">High Risk</div>
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
            <div class="text-center text-xs text-gray-400 mb-4">
              {getAnalysisTime()}
            </div>
          {/if}
          
          <!-- Detailed Flags -->
          {#if totalBoostedFlags > 0 || totalPerformanceIssues > 0}
            <div class="grid grid-cols-2 gap-4 text-center text-xs text-gray-300">
              <div>
                <span class="font-medium text-orange-400">{totalBoostedFlags}</span>
                <div class="text-gray-400">Boosting Indicators</div>
              </div>
              <div>
                <span class="font-medium text-red-400">{totalPerformanceIssues}</span>
                <div class="text-gray-400">Performance Issues</div>
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
