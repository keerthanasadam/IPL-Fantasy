#!/usr/bin/env python3
"""Upload side pot config from side_pots_config.json to the API.

Usage:
    python scripts/upload_side_pots.py <season_id> [--base-url URL] [--token TOKEN]

If --token is not provided, it will prompt for admin login credentials.
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

CONFIG_PATH = Path(__file__).parent.parent / "side_pots_config.json"


def login(base_url: str) -> str:
    """Login as admin and return JWT token."""
    email = input("Admin email: ")
    import getpass
    password = getpass.getpass("Admin password: ")

    resp = httpx.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def upload(base_url: str, season_id: str, token: str):
    config = json.loads(CONFIG_PATH.read_text())

    # Filter out empty entries from predictions
    predictions = [
        p for p in config.get("predictions", [])
        if any(p.get(k) for k in ["ipl_winner", "orange_cap", "purple_cap", "ipl_mvp"])
    ]

    payload = {
        "captain_vc_picks": [
            p for p in config.get("captain_vc_picks", [])
            if p.get("captain") or p.get("vice_captain")
        ],
        "awesome_threesome": [
            p for p in config.get("awesome_threesome", [])
            if p.get("batter") or p.get("bowler") or p.get("allrounder")
        ],
        "predictions": predictions,
    }

    print(f"\nUploading to {base_url}/api/seasons/{season_id}/side-pots")
    print(f"  Captain/VC picks: {len(payload['captain_vc_picks'])}")
    print(f"  Awesome Threesome: {len(payload['awesome_threesome'])}")
    print(f"  Predictions: {len(payload['predictions'])}")

    resp = httpx.post(
        f"{base_url}/api/seasons/{season_id}/side-pots",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    )
    resp.raise_for_status()
    result = resp.json()

    print(f"\n✅ Done! Upserted: {result.get('upserted', 0)}")
    if result.get("errors"):
        print(f"⚠️  Errors: {result['errors']}")


def update_owner_names(base_url: str, season_id: str, token: str):
    """Update user display_names based on the team_owners config."""
    config = json.loads(CONFIG_PATH.read_text())
    teams = config.get("teams", [])

    if not teams:
        print("No team owners to update.")
        return

    # Get season info to map team names to owner IDs
    resp = httpx.get(
        f"{base_url}/api/seasons/{season_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    )
    resp.raise_for_status()
    season_data = resp.json()

    team_owner_map = {}
    for t in season_data.get("teams", []):
        team_owner_map[t["name"].lower()] = t.get("owner_id")

    print(f"\nUpdating owner display names...")
    updated = 0
    for entry in teams:
        team_name = entry["team_name"]
        owner_name = entry["owner_name"]
        if not owner_name:
            continue
        owner_id = team_owner_map.get(team_name.lower())
        if not owner_id:
            print(f"  ⚠️  No owner found for team: {team_name}")
            continue

        # Use admin endpoint to update display name
        resp = httpx.patch(
            f"{base_url}/api/auth/users/{owner_id}",
            json={"display_name": owner_name},
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        if resp.status_code == 200:
            updated += 1
            print(f"  ✓ {team_name} → {owner_name}")
        else:
            print(f"  ⚠️  Failed to update {team_name}: {resp.status_code} {resp.text}")

    print(f"\n✅ Updated {updated} owner names")


def main():
    parser = argparse.ArgumentParser(description="Upload side pot config")
    parser.add_argument("season_id", help="Season UUID")
    parser.add_argument("--base-url", default="https://wolfpackipl2026.up.railway.app", help="API base URL")
    parser.add_argument("--token", help="JWT token (skip login)")
    parser.add_argument("--owners-only", action="store_true", help="Only update owner names")
    args = parser.parse_args()

    token = args.token or login(args.base_url)

    if args.owners_only:
        update_owner_names(args.base_url, args.season_id, token)
    else:
        update_owner_names(args.base_url, args.season_id, token)
        upload(args.base_url, args.season_id, token)


if __name__ == "__main__":
    main()
