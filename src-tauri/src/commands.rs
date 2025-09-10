use crate::{
    champ_select::ChampSelectSession, lobby::get_lobby_info, region::RegionInfo,
    utils::display_champ_select, AppConfig, Config, ManagedDodgeState, LCU,
};
use shaco::rest::{LCUClientInfo, RESTClient};
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[tauri::command]
pub async fn app_ready(
    app_handle: AppHandle,
    lcu: tauri::State<'_, LCU>,
    cfg: tauri::State<'_, AppConfig>,
) -> Result<Config, ()> {
    println!("App Ready!");
    let lcu = lcu.0.lock().await;
    let cfg = cfg.0.lock().await;

    println!("LCU State: {}", lcu.connected);
    println!("Config: {:?}", cfg);

    app_handle
        .emit_all("lcu_state_update", lcu.connected)
        .unwrap();

    Ok(cfg.clone())
}

#[tauri::command]
pub async fn get_lcu_state(lcu: tauri::State<'_, LCU>) -> Result<bool, ()> {
    let lcu = lcu.0.lock().await;
    Ok(lcu.connected)
}

#[tauri::command]
pub async fn get_config(cfg: tauri::State<'_, AppConfig>) -> Result<Config, ()> {
    let cfg = cfg.0.lock().await;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn set_config(
    cfg: tauri::State<'_, AppConfig>,
    new_cfg: Config,
    app_handle: AppHandle,
) -> Result<(), ()> {
    println!("Setting Config: {:?}", new_cfg);
    let mut cfg = cfg.0.lock().await;
    *cfg = new_cfg;

    // Save config to disk
    let cfg_folder = app_handle.path_resolver().app_config_dir().unwrap();
    let cfg_path = cfg_folder.join("config.json");
    let cfg_json = serde_json::to_string(&cfg.clone()).unwrap();
    tokio::fs::write(&cfg_path, cfg_json).await.unwrap();

    Ok(())
}

#[tauri::command]
pub async fn open_opgg_link(app_handle: AppHandle) -> Result<(), ()> {
    let lcu_state = app_handle.state::<LCU>();
    let lcu_state = lcu_state.0.lock().await;
    let app_client = RESTClient::new(lcu_state.data.clone().unwrap(), false).unwrap();

    let config = app_handle.state::<AppConfig>();
    let config = config.0.lock().await;

    let team = get_lobby_info(&app_client).await;
    let region_info: RegionInfo = serde_json::from_value(
        app_client
            .get("/riotclient/region-locale".to_string())
            .await
            .unwrap(),
    )
    .unwrap();

    let region = match region_info.web_region.as_str() {
        "SG2" => "SG",
        _ => &region_info.web_region,
    };

    display_champ_select(&team, region, &config.multi_provider);

    Ok(())
}

#[tauri::command]
pub async fn get_lcu_info(lcu: tauri::State<'_, LCU>) -> Result<LCUClientInfo, ()> {
    let lcu = lcu.0.lock().await;
    Ok(lcu.data.clone().unwrap())
}

#[tauri::command]
pub async fn dodge(app_handle: AppHandle) {
    let lcu_state = app_handle.state::<LCU>();
    let lcu_state = lcu_state.0.lock().await;
    let remoting_client = RESTClient::new(lcu_state.data.clone().unwrap(), true).unwrap();

    println!("Attempting to quit champ select...");
    let _resp = remoting_client
        .post(
            "/lol-login/v1/session/invoke?destination=lcdsServiceProxy&method=call&args=[\"\",\"teambuilder-draft\",\"quitV2\",\"\"]".to_string(),
            serde_json::json!({}),
        )
        .await
        .unwrap();
}

#[tauri::command]
pub async fn enable_dodge(app_handle: AppHandle) -> Result<(), ()> {
    let lcu_state = app_handle.state::<LCU>();
    let lcu_state = lcu_state.0.lock().await;
    let remoting_client = RESTClient::new(lcu_state.data.clone().unwrap(), true).unwrap();

    let dodge_state = app_handle.state::<ManagedDodgeState>();
    let mut dodge_state = dodge_state.0.lock().await;

    if dodge_state.enabled.is_some() {
        dodge_state.enabled = None;
        return Ok(());
    }

    let champ_select = serde_json::from_value::<ChampSelectSession>(
        remoting_client
            .get("/lol-champ-select/v1/session".to_string())
            .await
            .unwrap(),
    )
    .unwrap();

    dodge_state.enabled = Some(champ_select.game_id);
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct MCPRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: MCPParams,
}

#[derive(Serialize, Deserialize)]
struct MCPParams {
    name: String,
    arguments: Value,
}

#[derive(Serialize, Deserialize)]
struct MCPResponse {
    jsonrpc: String,
    id: u64,
    result: Option<Value>,
    error: Option<Value>,
}

#[tauri::command]
pub async fn call_opgg_api(function_name: String, params: Value) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let mcp_url = "https://mcp-api.op.gg/mcp";
    
    let request_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;

    let request = MCPRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: "tools/call".to_string(),
        params: MCPParams {
            name: function_name.clone(),
            arguments: params,
        },
    };

    println!("Calling OP.GG API function: {} with params: {:?}", function_name, request.params.arguments);

    match client.post(mcp_url)
        .json(&request)
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<MCPResponse>().await {
                Ok(mcp_response) => {
                    if let Some(error) = mcp_response.error {
                        println!("OP.GG API error: {:?}", error);
                        Err(format!("OP.GG API error: {:?}", error))
                    } else if let Some(result) = mcp_response.result {
                        println!("OP.GG API success: {:?}", result);
                        Ok(result)
                    } else {
                        Err("No result or error from OP.GG API".to_string())
                    }
                }
                Err(e) => {
                    println!("Failed to parse OP.GG API response: {:?}", e);
                    Err(format!("Failed to parse response: {:?}", e))
                }
            }
        }
        Err(e) => {
            println!("Failed to call OP.GG API: {:?}", e);
            Err(format!("Network error: {:?}", e))
        }
    }
}
