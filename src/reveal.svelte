<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import type { Config } from "$lib/config";
  import { updateConfig, getConfig } from "$lib/config";
  import { startIvernAutoSelect } from "$lib/lcu";
  import { state } from "$lib/state";
  import LobbyAnalysis from "$lib/components/LobbyAnalysis.svelte";
  import ConnectionStatus from "$lib/components/ConnectionStatus.svelte";
  import { listen } from '@tauri-apps/api/event';

  let config: Config;
  let ivernEnabled = false;
  let autoLock = true;
  let isInChampSelect = false;
  let lobbyPlayers: { gameName: string; gameTag: string; puuid?: string }[] = [];
  let currentRegion = 'euw'; // Force EUW for all lookups
  let champSelectListener: any = null;

  interface Participant {
    cid: string;
    game_name: string;
    game_tag: string;
    muted: boolean;
    name: string;
    pid: string;
    puuid: string;
    region: string;
  }

  interface LobbyData {
    participants: Participant[];
  }

  onMount(async () => {
    // Load current config
    config = await getConfig();
    ivernEnabled = config.autoSelectIvern || false;
    autoLock = config.autoLockIvern || true;
    
    // Start auto-select if enabled
    if (ivernEnabled) {
      startIvernAutoSelect(autoLock);
      state.set("Ivern auto-select is active");
    }

    // Listen for champion select events
    champSelectListener = await listen<LobbyData>('champ_select_started', (event) => {
      isInChampSelect = true;
      
      // Convert participants to the format expected by LobbyAnalysis
      lobbyPlayers = event.payload.participants
        .filter(p => p.game_name && p.game_tag) // Filter out invalid entries
        .map(p => ({
          gameName: p.game_name,
          gameTag: p.game_tag,
          puuid: p.puuid
        }));

      // Force EUW region regardless of LCU-reported region
      currentRegion = 'euw';

      state.set(`Champion select detected! Analyzing ${lobbyPlayers.length} players...`);
    });

    // Also listen for when champion select ends
    const gameFlowListener = await listen<string>('gameflow_state_update', (event) => {
      
      // Reset when leaving champion select
      if (event.payload !== 'ChampSelect' && isInChampSelect) {
        isInChampSelect = false;
        lobbyPlayers = [];
        state.set("Left champion select");
      }
    });
  });

  onDestroy(() => {
    // Clean up event listeners
    if (champSelectListener) {
      champSelectListener();
    }
  });

  // Map Riot region codes to OP.GG region codes
  function mapRegion(input: string): string {
    if (!input) return 'na';
    const val = input.toUpperCase();
    // Accept already-correct slugs
    const knownSlugs = new Set(['na','euw','eune','kr','jp','br','lan','las','oce','ru','tr','sg','ph','tw','vn','th']);
    if (knownSlugs.has(input.toLowerCase())) return input.toLowerCase();

    const regionMap: Record<string, string> = {
      // Platform IDs
      'NA1': 'na', 'EUW1': 'euw', 'EUN1': 'eune', 'KR': 'kr', 'JP1': 'jp',
      'BR1': 'br', 'LA1': 'lan', 'LA2': 'las', 'OC1': 'oce', 'RU': 'ru', 'TR1': 'tr',
      'SG2': 'sg', 'PH2': 'ph', 'TW2': 'tw', 'VN2': 'vn', 'TH2': 'th',
      // Web region variants
      'NA': 'na', 'EUW': 'euw', 'EUNE': 'eune', 'EUN': 'eune', 'JP': 'jp', 'BR': 'br',
      'LA': 'lan', 'OC': 'oce', 'TR': 'tr', 'SG': 'sg', 'PH': 'ph', 'TW': 'tw', 'VN': 'vn', 'TH': 'th'
    };
    return regionMap[val] || 'na';
  }

  async function toggleIvernSelect() {
    ivernEnabled = !ivernEnabled;
    
    // Update config
    config.autoSelectIvern = ivernEnabled;
    await updateConfig(config);
    
    if (ivernEnabled) {
      startIvernAutoSelect(autoLock);
      state.set("Ivern auto-select is now active");
    } else {
      state.set("Ivern auto-select is disabled");
    }
  }

  async function toggleAutoLock() {
    autoLock = !autoLock;
    
    // Update config
    config.autoLockIvern = autoLock;
    await updateConfig(config);
    
    if (ivernEnabled) {
      // Restart with new settings
      startIvernAutoSelect(autoLock);
      state.set(`Ivern auto-select is active (${autoLock ? 'with auto-lock' : 'hover only'})`);
    }
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Top Bar with Connection Status -->
  <div class="flex justify-between items-center p-4 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
        <span class="text-white font-bold text-sm">R</span>
      </div>
      <div>
        <h1 class="text-xl font-bold text-white">Reveal</h1>
        <p class="text-xs text-gray-300">Champion Select Utility</p>
      </div>
    </div>
    
    <!-- Connection Status in top-right -->
    <ConnectionStatus />
  </div>

  <!-- Main Content -->
  <div class="flex flex-col gap-6 p-6 max-w-7xl mx-auto">

  <!-- Lobby Analysis Section -->
  {#if isInChampSelect}
    <LobbyAnalysis players={lobbyPlayers} region={currentRegion} autoAnalyze={true} />
  {:else}
    <LobbyAnalysis players={[]} region={currentRegion} autoAnalyze={false} />
  {/if}

  <!-- Settings Section -->
  <Card class="bg-gray-800/90 backdrop-blur-sm border-0 shadow-lg">
    <CardHeader class="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
      <CardTitle class="text-xl flex items-center gap-2">
        <div class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
          <span class="text-sm">⚙️</span>
        </div>
        Settings
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-6 p-6">
      <!-- Ivern Auto-Select Settings -->
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-white">Ivern Auto-Select</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center justify-between p-4 bg-gradient-to-br from-green-800/20 to-emerald-800/20 border border-green-600 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div>
              <span class="font-medium text-green-200">Enable Auto-Select</span>
              <p class="text-sm text-green-400">Automatically select Ivern in champion select</p>
            </div>
            <Button 
              variant={ivernEnabled ? "default" : "secondary"} 
              on:click={toggleIvernSelect}
              class={ivernEnabled ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {ivernEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
          
          <div class="flex items-center justify-between p-4 bg-gradient-to-br from-blue-800/20 to-cyan-800/20 border border-blue-600 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div>
              <span class="font-medium text-blue-200">Auto-lock Mode</span>
              <p class="text-sm text-blue-400">Lock in Ivern immediately or just hover</p>
            </div>
            <Button 
              variant={autoLock ? "default" : "secondary"} 
              on:click={toggleAutoLock}
              disabled={!ivernEnabled}
              class={autoLock && ivernEnabled ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {autoLock ? "Lock-in" : "Hover only"}
            </Button>
          </div>
        </div>
      </div>

      <!-- Player Analysis Settings -->
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-white">Player Analysis</h3>
        <div class="p-4 bg-gradient-to-br from-indigo-800/20 to-purple-800/20 border border-indigo-600 rounded-xl shadow-sm">
          <div class="flex items-center space-x-2 mb-3">
            <div class="w-4 h-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
              <span class="text-white text-xs">✓</span>
            </div>
            <span class="font-semibold text-indigo-200">Automatic Analysis</span>
          </div>
          <p class="text-sm text-indigo-300 leading-relaxed">
            Player analysis will automatically start when you join a champion select lobby. 
            The system will check each player's winrate, recent performance, and potential boosting indicators.
          </p>
        </div>
        
        <!-- Analysis Features -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-gradient-to-br from-green-800/20 to-emerald-800/20 border border-green-600 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-green-200 mb-2 flex items-center gap-2">
              <span class="text-base">📊</span>
              Win Rate Analysis
            </h4>
            <p class="text-sm text-green-400 leading-relaxed">Real-time win rate and rank information</p>
          </div>
          <div class="p-4 bg-gradient-to-br from-orange-800/20 to-amber-800/20 border border-orange-600 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-orange-200 mb-2 flex items-center gap-2">
              <span class="text-base">🕵️</span>
              Boosting Detection
            </h4>
            <p class="text-sm text-orange-400 leading-relaxed">Flash position changes and suspicious patterns</p>
          </div>
          <div class="p-4 bg-gradient-to-br from-red-800/20 to-pink-800/20 border border-red-600 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-red-200 mb-2 flex items-center gap-2">
              <span class="text-base">⚡</span>
              Performance Flags
            </h4>
            <p class="text-sm text-red-400 leading-relaxed">Feeding, poor KDA, and consistency issues</p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Status Display -->
  <Card class="bg-gray-800/90 backdrop-blur-sm border-0 shadow-lg">
    <CardContent class="p-5">
      <div class="flex items-center justify-center gap-3">
        <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span class="font-medium text-gray-300">Status:</span>
        <span class="px-3 py-1 bg-gradient-to-r from-gray-700 to-gray-600 rounded-full text-sm font-medium text-white">
          {$state || "Ready"}
        </span>
      </div>
    </CardContent>
  </Card>
  </div>
</div>
