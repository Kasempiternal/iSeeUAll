import { invoke } from "@tauri-apps/api/tauri";
import type { ChampSelect } from "./champ_select";
import { state } from "./state";

// Champion IDs - Ivern's ID is 427
const CHAMPION_IDS = {
  IVERN: 427
};

/**
 * Check if the player is in champion select
 */
export async function isInChampSelect(): Promise<boolean> {
  try {
    const response = await invoke("make_request", {
      method: "GET",
      path: "/lol-champ-select/v1/session"
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get current champion select session data
 */
export async function getChampSelectSession(): Promise<any> {
  try {
    const response = await invoke("make_request", {
      method: "GET",
      path: "/lol-champ-select/v1/session"
    });
    return JSON.parse(response as string);
  } catch (e) {
    console.error("Failed to get champion select session:", e);
    return null;
  }
}

/**
 * Get the player's assigned position in champion select
 */
export async function getAssignedPosition(): Promise<number> {
  try {
    const session = await getChampSelectSession();
    if (!session) return -1;
    
    const localPlayerCellId = session.localPlayerCellId;
    const actions = session.actions.flat();
    
    for (const action of actions) {
      if (action.actorCellId === localPlayerCellId) {
        return action.id;
      }
    }
    return -1;
  } catch (e) {
    console.error("Failed to get assigned position:", e);
    return -1;
  }
}

/**
 * Auto-select Ivern in champion select
 */
export async function autoSelectIvern(): Promise<boolean> {
  try {
    if (!await isInChampSelect()) {
      return false;
    }
    
    const session = await getChampSelectSession();
    if (!session) return false;
    
    const localPlayerCellId = session.localPlayerCellId;
    const actions = session.actions.flat();
    let actionId = -1;
    
    for (const action of actions) {
      if (action.actorCellId === localPlayerCellId && action.type === "pick") {
        actionId = action.id;
        break;
      }
    }
    
    if (actionId === -1) return false;
    
    // Check if it's the player's turn to pick
    const currentAction = actions.find((a: any) => a.id === actionId);
    if (!currentAction?.isInProgress) return false;
    
    // Lock in Ivern
    const response = await invoke("make_request", {
      method: "PATCH",
      path: `/lol-champ-select/v1/session/actions/${actionId}`,
      body: JSON.stringify({
        championId: CHAMPION_IDS.IVERN,
        completed: true
      })
    });
    
    state.set("Ivern selected and locked in!");
    return true;
  } catch (e) {
    console.error("Failed to auto-select Ivern:", e);
    return false;
  }
}

/**
 * Hover Ivern in champion select (without locking in)
 */
export async function hoverIvern(): Promise<boolean> {
  try {
    if (!await isInChampSelect()) {
      return false;
    }
    
    const session = await getChampSelectSession();
    if (!session) return false;
    
    const localPlayerCellId = session.localPlayerCellId;
    const actions = session.actions.flat();
    let actionId = -1;
    
    for (const action of actions) {
      if (action.actorCellId === localPlayerCellId && action.type === "pick") {
        actionId = action.id;
        break;
      }
    }
    
    if (actionId === -1) return false;
    
    // Hover Ivern without locking in
    const response = await invoke("make_request", {
      method: "PATCH",
      path: `/lol-champ-select/v1/session/actions/${actionId}`,
      body: JSON.stringify({
        championId: CHAMPION_IDS.IVERN,
        completed: false
      })
    });
    
    state.set("Hovering Ivern...");
    return true;
  } catch (e) {
    console.error("Failed to hover Ivern:", e);
    return false;
  }
}

/**
 * Start monitoring champion select to auto-select Ivern
 * @param autoLock Whether to automatically lock in Ivern or just hover
 */
export function startIvernAutoSelect(autoLock: boolean = true): void {
  // Check every second if we're in champion select
  const interval = setInterval(async () => {
    if (await isInChampSelect()) {
      if (autoLock) {
        await autoSelectIvern();
      } else {
        await hoverIvern();
      }
    }
  }, 1000);
}