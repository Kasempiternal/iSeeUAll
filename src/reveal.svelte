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
  let lobbyPlayers: { gameName: string; gameTag: string }[] = [];
  let currentRegion = 'na1'; // Default region, will be updated from backend
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
      console.log('Champion select started:', event.payload);
      isInChampSelect = true;
      
      // Convert participants to the format expected by LobbyAnalysis
      lobbyPlayers = event.payload.participants
        .filter(p => p.game_name && p.game_tag) // Filter out invalid entries
        .map(p => ({
          gameName: p.game_name,
          gameTag: p.game_tag
        }));

      // Set region from first participant (they should all be the same)
      if (event.payload.participants.length > 0) {
        currentRegion = mapRegion(event.payload.participants[0].region);
      }

      state.set(`Champion select detected! Analyzing ${lobbyPlayers.length} players...`);
    });

    // Also listen for when champion select ends
    const gameFlowListener = await listen<string>('gameflow_state_update', (event) => {
      console.log('Gameflow state update:', event.payload);
      
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
  function mapRegion(riotRegion: string): string {
    const regionMap: Record<string, string> = {
      'NA1': 'na',
      'EUW1': 'euw',
      'EUN1': 'eune', 
      'KR': 'kr',
      'JP1': 'jp',
      'BR1': 'br',
      'LA1': 'lan',
      'LA2': 'las',
      'OC1': 'oce',
      'RU': 'ru',
      'TR1': 'tr',
      'SG2': 'sg',
      'PH2': 'ph',
      'TW2': 'tw',
      'VN2': 'vn',
      'TH2': 'th'
    };
    
    return regionMap[riotRegion] || 'na';
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

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
  <!-- Top Bar with Connection Status -->
  <div class="flex justify-between items-center p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
        <span class="text-white font-bold text-sm">R</span>
      </div>
      <div>
        <h1 class="text-xl font-bold text-gray-900">Reveal</h1>
        <p class="text-xs text-gray-500">Champion Select Utility</p>
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
  <Card class="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
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
        <h3 class="text-lg font-semibold">Ivern Auto-Select</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center justify-between p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div>
              <span class="font-medium text-green-800">Enable Auto-Select</span>
              <p class="text-sm text-green-600">Automatically select Ivern in champion select</p>
            </div>
            <Button 
              variant={ivernEnabled ? "default" : "secondary"} 
              on:click={toggleIvernSelect}
              class={ivernEnabled ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {ivernEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
          
          <div class="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <div>
              <span class="font-medium text-blue-800">Auto-lock Mode</span>
              <p class="text-sm text-blue-600">Lock in Ivern immediately or just hover</p>
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
        <h3 class="text-lg font-semibold">Player Analysis</h3>
        <div class="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl shadow-sm">
          <div class="flex items-center space-x-2 mb-3">
            <div class="w-4 h-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
              <span class="text-white text-xs">✓</span>
            </div>
            <span class="font-semibold text-indigo-900">Automatic Analysis</span>
          </div>
          <p class="text-sm text-indigo-800 leading-relaxed">
            Player analysis will automatically start when you join a champion select lobby. 
            The system will check each player's winrate, recent performance, and potential boosting indicators.
          </p>
        </div>
        
        <!-- Analysis Features -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-green-700 mb-2 flex items-center gap-2">
              <span class="text-base">📊</span>
              Win Rate Analysis
            </h4>
            <p class="text-sm text-green-600 leading-relaxed">Real-time win rate and rank information</p>
          </div>
          <div class="p-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-orange-700 mb-2 flex items-center gap-2">
              <span class="text-base">🕵️</span>
              Boosting Detection
            </h4>
            <p class="text-sm text-orange-600 leading-relaxed">Flash position changes and suspicious patterns</p>
          </div>
          <div class="p-4 bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-xl shadow-sm hover:shadow-md transition-all">
            <h4 class="font-semibold text-red-700 mb-2 flex items-center gap-2">
              <span class="text-base">⚡</span>
              Performance Flags
            </h4>
            <p class="text-sm text-red-600 leading-relaxed">Feeding, poor KDA, and consistency issues</p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Status Display -->
  <Card class="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
    <CardContent class="p-5">
      <div class="flex items-center justify-center gap-3">
        <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span class="font-medium text-gray-700">Status:</span>
        <span class="px-3 py-1 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full text-sm font-medium text-gray-800">
          {$state || "Ready"}
        </span>
      </div>
    </CardContent>
  </Card>
  </div>
</div>