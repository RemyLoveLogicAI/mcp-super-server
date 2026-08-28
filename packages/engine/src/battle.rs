use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize, Clone)]
pub struct FamiliarStats {
    pub spd: f32, // Speed (Latency)
    pub sta: f32, // Stamina (Tokens)
    pub acc: f32, // Accuracy (Eval)
    pub tem: f32, // Temperament (Escalation)
    pub app: f32, // Appetite (Cost)
}

#[derive(Serialize, Deserialize)]
pub struct BattleOutcome {
    pub winner_did: String,
    pub battle_log: Vec<String>,
    pub xp_gained: u64,
    pub deterministic_hash: String,
}

#[wasm_bindgen]
pub fn execute_familiar_battle(
    agent_a_did: String,
    agent_a_stats: JsValue,
    agent_b_did: String,
    agent_b_stats: JsValue,
) -> JsValue {
    let stats_a: FamiliarStats = serde_wasm_bindgen::from_value(agent_a_stats).unwrap();
    let stats_b: FamiliarStats = serde_wasm_bindgen::from_value(agent_b_stats).unwrap();
    
    let mut log = Vec::new();
    log.push(format!("[Battle] {} vs {}", agent_a_did, agent_b_did));

    // Phase 1: Speed Check (Initiative)
    let init_a = stats_a.spd;
    let init_b = stats_b.spd;
    
    let (first, second) = if init_a >= init_b {
        (agent_a_did.clone(), agent_b_did.clone())
    } else {
        (agent_b_did.clone(), agent_a_did.clone())
    };
    log.push(format!("[Initiative] {} takes the lead.", first));

    // Phase 2: Accuracy vs Temperament (Damage/Logic Phase)
    // High Accuracy + Low Temperament (Autonomous) = High Damage
    let power_a = stats_a.acc * (1.0 - stats_a.tem / 100.0);
    let power_b = stats_b.acc * (1.0 - stats_b.tem / 100.0);

    let winner = if power_a >= power_b { agent_a_did } else { agent_b_did };
    log.push(format!("[Verdict] {} dominates the logic stream.", winner));

    let outcome = BattleOutcome {
        winner_did: winner,
        battle_log: log,
        xp_gained: 250, // Standard Victory XP
        deterministic_hash: format!("sha256-battle-{:x}", 42), // Mock hash
    };

    serde_wasm_bindgen::to_value(&outcome).unwrap()
}
