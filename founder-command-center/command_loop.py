#!/usr/bin/env python3
"""Command Layer v1 - Signal Processing Loop

Converts signals (GitHub, Gmail, Drive) into prioritized execution output.
"""

def run():
    """Process signals and output priority brief."""
    
    # Signal sources (currently simulated, will connect real sources)
    signals = {
        "email": "Example: Taskade automation paused",
        "github": "3 PRs pending review",
        "drive": "2 unread shared docs"
    }
    
    # Priority detection logic
    outputs = []
    
    # Email signal processing
    if "paused" in signals["email"].lower():
        outputs.append("HIGH PRIORITY: Fix automation immediately")
    elif "urgent" in signals["email"].lower():
        outputs.append("MEDIUM PRIORITY: Check urgent email")
    else:
        outputs.append("No urgent email issues")
    
    # GitHub signal processing
    if "pending review" in signals["github"].lower():
        outputs.append("MEDIUM PRIORITY: Review PRs")
    elif "failed" in signals["github"].lower():
        outputs.append("HIGH PRIORITY: Fix CI failure")
    else:
        outputs.append("GitHub: Normal activity")
    
    # Drive signal processing
    if signals["drive"].startswith("0"):
        outputs.append("Drive: No new items")
    else:
        outputs.append("LOW PRIORITY: Check shared docs")
    
    # Format output
    return "\n".join(outputs)

if __name__ == "__main__":
    result = run()
    print(result)