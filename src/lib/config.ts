import { invoke } from "@tauri-apps/api/tauri";

export interface Config {
    autoOpen: boolean;
    autoAccept: boolean;
    acceptDelay: number;
    multiProvider: string;
    autoSelectIvern?: boolean;
    autoLockIvern?: boolean;
}

export async function getConfig(): Promise<Config> {
    return await invoke("get_config");
}

export async function updateConfig(config: Config) {
    await invoke("set_config", {
        newCfg: config
    });
}