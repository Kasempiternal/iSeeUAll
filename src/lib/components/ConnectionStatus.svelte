<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listen } from '@tauri-apps/api/event';
  import { Badge } from "$lib/components/ui/badge";
  import { Wifi, WifiOff } from "lucide-svelte";

  let isConnected = false;
  let connectionListener: any = null;

  onMount(async () => {
    // Listen for LCU connection status updates
    connectionListener = await listen<boolean>('lcu_state_update', (event) => {
      isConnected = event.payload;
      console.log('LCU connection status updated:', isConnected);
    });
  });

  onDestroy(() => {
    if (connectionListener) {
      connectionListener();
    }
  });
</script>

<div class="flex items-center gap-2">
  <Badge 
    variant={isConnected ? "default" : "secondary"}
    class={`flex items-center gap-1.5 px-3 py-1.5 ${
      isConnected 
        ? 'bg-green-500 hover:bg-green-600 text-white' 
        : 'bg-red-500 hover:bg-red-600 text-white'
    }`}
  >
    {#if isConnected}
      <Wifi class="h-3.5 w-3.5" />
      <span class="text-xs font-medium">Connected</span>
    {:else}
      <WifiOff class="h-3.5 w-3.5" />
      <span class="text-xs font-medium">Disconnected</span>
    {/if}
  </Badge>
</div>