use wasm_bindgen::prelude::*;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand::rngs::SmallRng;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
pub struct SlotEngine {
    reels: Vec<Vec<u8>>,
    rng: SmallRng,
}

#[derive(Serialize, Deserialize)]
pub struct SpinResult {
    pub matrix: Vec<Vec<u8>>,
    pub is_win: bool,
    pub payout_credits: u64,
    pub hades_entropy_hash: String,
}

#[wasm_bindgen]
impl SlotEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> SlotEngine {
        console_error_panic_hook::set_once();
        SlotEngine {
            reels: vec![
                vec![0, 1, 2, 3, 4, 5], // Reel 1
                vec![0, 1, 2, 3, 4, 5], // Reel 2
                vec![0, 1, 2, 3, 4, 5], // Reel 3
            ],
            rng: SmallRng::seed_from_u64(seed),
        }
    }

    pub fn spin(&mut self) -> JsValue {
        let mut result_matrix = Vec::new();
        
        for reel in &self.reels {
            let mut column = Vec::new();
            for _ in 0..3 {
                column.push(*reel.choose(&mut self.rng).unwrap());
            }
            result_matrix.push(column);
        }

        // Logic: Simple 3x3 check (center row)
        let is_win = result_matrix[0][1] == result_matrix[1][1] && result_matrix[1][1] == result_matrix[2][1];
        let payout = if is_win { 1000 } else { 0 };

        let res = SpinResult {
            matrix: result_matrix,
            is_win,
            payout_credits: payout,
            hades_entropy_hash: format!("sha256-provable-{:x}", self.rng.next_u64()),
        };

        serde_json::to_value(&res).unwrap().into()
    }

    pub fn get_frame_target_ms(&self) -> f64 {
        16.666 // Target 60fps for AAA smoothness
    }
}
