use serde::{Deserialize, Serialize};
use shaco::rest::RESTClient;

#[derive(Debug, Serialize, Deserialize)]
pub struct Participant {
    pub cid: String,
    pub game_name: String,
    pub game_tag: String,
    pub muted: bool,
    pub name: String,
    pub pid: String,
    pub puuid: String,
    pub region: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Lobby {
    pub participants: Vec<Participant>,
}

pub async fn get_lobby_info(app_client: &RESTClient) -> Lobby {
    println!("Attempting to fetch lobby info from LCU...");
    
    let response = app_client
        .get("/chat/v5/participants".to_string())
        .await;
        
    if let Err(e) = response {
        println!("Error fetching lobby info: {:?}", e);
        return Lobby {
            participants: Vec::new(),
        };
    }
    
    let response_value = response.unwrap();
    println!("Raw lobby response: {}", response_value);
    
    let team: Result<Lobby, _> = serde_json::from_value(response_value);
    
    if let Err(e) = team {
        println!("Error parsing lobby response: {:?}", e);
        return Lobby {
            participants: Vec::new(),
        };
    }
    
    let team = team.unwrap();
    println!("Parsed {} participants", team.participants.len());

    // filter out all cids that contain champ-select
    let team_participants = team
        .participants
        .into_iter()
        .filter(|p| p.cid.contains("champ-select"))
        .collect::<Vec<Participant>>();

    println!("Found {} champion select participants", team_participants.len());
    
    for participant in &team_participants {
        println!("Participant: {} ({}#{})", participant.name, participant.game_name, participant.game_tag);
    }

    let team = Lobby {
        participants: team_participants,
    };

    team
}
