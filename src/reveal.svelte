<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import type { Config } from "$lib/config";
  import { updateConfig, getConfig } from "$lib/config";
  import { startIvernAutoSelect } from "$lib/lcu";
  import { state } from "$lib/state";
  import LobbyAnalysis from "$lib/components/LobbyAnalysis.svelte";
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

<div class="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-3xl font-bold">Reveal</h1>
    <p class="text-gray-600 mt-1">League of Legends Champion Select Utility</p>
  </div>

  <!-- Lobby Analysis Section -->
  {#if isInChampSelect}
    <LobbyAnalysis players={lobbyPlayers} region={currentRegion} autoAnalyze={true} />
  {:else}
    <LobbyAnalysis players={[]} region={currentRegion} autoAnalyze={false} />
  {/if}

  <!-- Settings Section -->
  <Card>
    <CardHeader>
      <CardTitle class="text-xl">Settings</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- Ivern Auto-Select Settings -->
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">Ivern Auto-Select</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <span class="font-medium">Enable Auto-Select</span>
              <p class="text-sm text-gray-600">Automatically select Ivern in champion select</p>
            </div>
            <Button 
              variant={ivernEnabled ? "default" : "secondary"} 
              on:click={toggleIvernSelect}
            >
              {ivernEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
          
          <div class="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <span class="font-medium">Auto-lock Mode</span>
              <p class="text-sm text-gray-600">Lock in Ivern immediately or just hover</p>
            </div>
            <Button 
              variant={autoLock ? "default" : "secondary"} 
              on:click={toggleAutoLock}
              disabled={!ivernEnabled}
            >
              {autoLock ? "Lock-in" : "Hover only"}
            </Button>
          </div>
        </div>
      </div>

      <!-- Player Analysis Settings -->
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">Player Analysis</h3>
        <div class="p-3 border rounded-lg bg-blue-50">
          <div class="flex items-center space-x-2 mb-2">
            <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span class="font-medium text-blue-900">Automatic Analysis</span>
          </div>
          <p class="text-sm text-blue-800">
            Player analysis will automatically start when you join a champion select lobby. 
            The system will check each player's winrate, recent performance, and potential boosting indicators.
          </p>
        </div>
        
        <!-- Analysis Features -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div class="p-3 border rounded-lg">
            <h4 class="font-medium text-green-700 mb-1">✅ Win Rate Analysis</h4>
            <p class="text-gray-600">Real-time win rate and rank information</p>
          </div>
          <div class="p-3 border rounded-lg">
            <h4 class="font-medium text-orange-700 mb-1">⚠️ Boosting Detection</h4>
            <p class="text-gray-600">Flash position changes and suspicious patterns</p>
          </div>
          <div class="p-3 border rounded-lg">
            <h4 class="font-medium text-red-700 mb-1">🚨 Performance Flags</h4>
            <p class="text-gray-600">Feeding, poor KDA, and consistency issues</p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Status Display -->
  <Card>
    <CardContent class="p-4">
      <div class="text-center text-sm">
        <span class="font-medium">Status:</span>
        <span class="ml-2">{$state || "Ready"}</span>
      </div>
    </CardContent>
  </Card>
</div>